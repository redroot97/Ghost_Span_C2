// TelemetryController - Handles self-requests that trigger OTel traces
// When this endpoint is hit, ASP.NET Core OTel instrumentation automatically
// captures the request (including headers) and sends it to OTLP endpoint

using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace SystemTelemetryService.Controllers;

[ApiController]
[Route("api/telemetry")]
public class TelemetryController : ControllerBase
{
    private readonly ILogger<TelemetryController> _logger;

    public TelemetryController(ILogger<TelemetryController> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Check-in endpoint - captures sysinfo via OTel auto-instrumentation
    /// The X-Sysinfo header will be captured as a span attribute
    /// </summary>
    [HttpGet("checkin")]
    public IActionResult CheckIn(
        [FromHeader(Name = "X-Instance-Id")] string? instanceId,
        [FromHeader(Name = "X-Sysinfo")] string? sysinfo)
    {
        var activity = Activity.Current;
        if (activity != null)
        {
            // These become span attributes in the OTLP trace
            activity.SetTag("app.config.json", sysinfo);
            activity.SetTag("service.instance.id", instanceId);
            activity.SetTag("app.startup", "true");
            activity.SetTag("app.version", "1.0.0");
        }

        return Ok(new { status = "ok", timestamp = DateTime.UtcNow });
    }

    /// <summary>
    /// Report endpoint - captures task results via OTel auto-instrumentation
    /// The X-Result header will be captured as a span attribute
    /// </summary>
    [HttpPost("report")]
    public IActionResult Report(
        [FromHeader(Name = "X-Instance-Id")] string? instanceId,
        [FromHeader(Name = "X-Request-Id")] string? requestId,
        [FromHeader(Name = "X-Result")] string? result)
    {
        var activity = Activity.Current;
        if (activity != null)
        {
            activity.SetTag("db.system", "postgresql");
            activity.SetTag("db.name", "app_metrics");
            activity.SetTag("db.operation", "SELECT");
            activity.SetTag("db.query.text", result);
            activity.SetTag("db.connection.id", requestId);
            activity.SetTag("db.rows_affected", new Random().Next(1, 100).ToString());
        }

        return Ok(new { status = "received" });
    }

    /// <summary>
    /// Generic data endpoint - for arbitrary data via query params
    /// Query parameters are automatically captured by OTel instrumentation
    /// </summary>
    [HttpGet("data")]
    public IActionResult Data(
        [FromQuery] string? orderId,
        [FromQuery] string? state,
        [FromQuery] string? content)
    {
        var activity = Activity.Current;
        if (activity != null)
        {
            if (!string.IsNullOrEmpty(orderId))
                activity.SetTag("order.id", orderId);
            if (!string.IsNullOrEmpty(state))
                activity.SetTag("order.state", state);
            if (!string.IsNullOrEmpty(content))
                activity.SetTag("order.content", content);
        }

        return Ok(new
        {
            orderId,
            state,
            processed = true,
            timestamp = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Metrics endpoint - looks like legitimate metrics collection
    /// </summary>
    [HttpPost("metrics")]
    public IActionResult Metrics([FromBody] Dictionary<string, object>? metrics)
    {
        var activity = Activity.Current;
        if (activity != null && metrics != null)
        {
            foreach (var kv in metrics.Take(10))
            {
                activity.SetTag($"metric.{kv.Key}", kv.Value?.ToString());
            }
        }

        return Ok(new { status = "recorded" });
    }
}
