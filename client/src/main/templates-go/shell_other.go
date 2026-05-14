//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

func configureShellCmd(cmd *exec.Cmd) {
	// No special configuration needed for non-Windows platforms
}

// getWindowsArch is a no-op on non-Windows platforms
func getWindowsArch() string {
	return ""
}

// nativeProcessList uses /proc on Linux/macOS
func nativeProcessList() string {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return "[error: cannot read /proc]"
	}

	var lines []string
	lines = append(lines, fmt.Sprintf("%-8s %s", "PID", "CMDLINE"))
	lines = append(lines, strings.Repeat("-", 50))

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}
		cmdline, _ := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		cmd := strings.ReplaceAll(string(cmdline), "\x00", " ")
		if cmd == "" {
			comm, _ := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
			cmd = strings.TrimSpace(string(comm))
		}
		lines = append(lines, fmt.Sprintf("%-8d %s", pid, strings.TrimSpace(cmd)))
	}

	return strings.Join(lines, "\n")
}

// nativeNetstat reads from /proc/net on Linux
func nativeNetstat() string {
	var lines []string
	lines = append(lines, fmt.Sprintf("%-6s %-22s %-22s %-12s", "PROTO", "LOCAL", "REMOTE", "STATE"))
	lines = append(lines, strings.Repeat("-", 70))

	// TCP
	if data, err := os.ReadFile("/proc/net/tcp"); err == nil {
		lines = append(lines, parseNetTcp(string(data), "TCP")...)
	}

	// UDP
	if data, err := os.ReadFile("/proc/net/udp"); err == nil {
		lines = append(lines, parseNetUdp(string(data), "UDP")...)
	}

	return strings.Join(lines, "\n")
}

func parseNetTcp(data, proto string) []string {
	var lines []string
	for i, line := range strings.Split(data, "\n") {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		local := parseHexAddr(fields[1])
		remote := parseHexAddr(fields[2])
		state := tcpStateFromHex(fields[3])
		lines = append(lines, fmt.Sprintf("%-6s %-22s %-22s %-12s", proto, local, remote, state))
	}
	return lines
}

func parseNetUdp(data, proto string) []string {
	var lines []string
	for i, line := range strings.Split(data, "\n") {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		local := parseHexAddr(fields[1])
		lines = append(lines, fmt.Sprintf("%-6s %-22s %-22s %-12s", proto, local, "*:*", "-"))
	}
	return lines
}

func parseHexAddr(s string) string {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return s
	}
	ip, _ := strconv.ParseUint(parts[0], 16, 32)
	port, _ := strconv.ParseUint(parts[1], 16, 16)
	return fmt.Sprintf("%d.%d.%d.%d:%d",
		ip&0xFF, (ip>>8)&0xFF, (ip>>16)&0xFF, (ip>>24)&0xFF, port)
}

func tcpStateFromHex(s string) string {
	states := map[string]string{
		"01": "ESTABLISHED", "02": "SYN_SENT", "03": "SYN_RECV",
		"04": "FIN_WAIT1", "05": "FIN_WAIT2", "06": "TIME_WAIT",
		"07": "CLOSE", "08": "CLOSE_WAIT", "09": "LAST_ACK",
		"0A": "LISTEN", "0B": "CLOSING",
	}
	if state, ok := states[strings.ToUpper(s)]; ok {
		return state
	}
	return s
}
