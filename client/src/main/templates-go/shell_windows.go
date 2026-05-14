//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

var (
	modKernel32 = syscall.NewLazyDLL("kernel32.dll")
	modIphlpapi = syscall.NewLazyDLL("iphlpapi.dll")
	modPsapi    = syscall.NewLazyDLL("psapi.dll")

	procCreateToolhelp32Snapshot = modKernel32.NewProc("CreateToolhelp32Snapshot")
	procProcess32FirstW          = modKernel32.NewProc("Process32FirstW")
	procProcess32NextW           = modKernel32.NewProc("Process32NextW")
	procCloseHandle              = modKernel32.NewProc("CloseHandle")
	procOpenProcess              = modKernel32.NewProc("OpenProcess")
	procGetExtendedTcpTable      = modIphlpapi.NewProc("GetExtendedTcpTable")
	procGetExtendedUdpTable      = modIphlpapi.NewProc("GetExtendedUdpTable")
)

func configureShellCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

// getWindowsArch returns the actual OS architecture on Windows
// This detects the real OS arch even when running x64 on ARM64 via emulation
func getWindowsArch() string {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getNativeSystemInfo := kernel32.NewProc("GetNativeSystemInfo")

	type systemInfo struct {
		wProcessorArchitecture      uint16
		wReserved                   uint16
		dwPageSize                  uint32
		lpMinimumApplicationAddress uintptr
		lpMaximumApplicationAddress uintptr
		dwActiveProcessorMask       uintptr
		dwNumberOfProcessors        uint32
		dwProcessorType             uint32
		dwAllocationGranularity     uint32
		wProcessorLevel             uint16
		wProcessorRevision          uint16
	}

	var si systemInfo
	getNativeSystemInfo.Call(uintptr(unsafe.Pointer(&si)))

	const (
		PROCESSOR_ARCHITECTURE_AMD64 = 9
		PROCESSOR_ARCHITECTURE_ARM64 = 12
		PROCESSOR_ARCHITECTURE_INTEL = 0
		PROCESSOR_ARCHITECTURE_ARM   = 5
	)

	switch si.wProcessorArchitecture {
	case PROCESSOR_ARCHITECTURE_AMD64:
		return "amd64"
	case PROCESSOR_ARCHITECTURE_ARM64:
		return "arm64"
	case PROCESSOR_ARCHITECTURE_INTEL:
		return "386"
	case PROCESSOR_ARCHITECTURE_ARM:
		return "arm"
	default:
		return ""
	}
}

// =============================================================================
// NATIVE PROCESS LISTING (no cmd.exe)
// =============================================================================

const (
	TH32CS_SNAPPROCESS = 0x00000002
	MAX_PATH           = 260
)

type processEntry32W struct {
	dwSize              uint32
	cntUsage            uint32
	th32ProcessID       uint32
	th32DefaultHeapID   uintptr
	th32ModuleID        uint32
	cntThreads          uint32
	th32ParentProcessID uint32
	pcPriClassBase      int32
	dwFlags             uint32
	szExeFile           [MAX_PATH]uint16
}

func nativeProcessList() string {
	handle, _, _ := procCreateToolhelp32Snapshot.Call(TH32CS_SNAPPROCESS, 0)
	if handle == 0 || handle == ^uintptr(0) {
		return "[error: failed to create snapshot]"
	}
	defer procCloseHandle.Call(handle)

	var entry processEntry32W
	entry.dwSize = uint32(unsafe.Sizeof(entry))

	ret, _, _ := procProcess32FirstW.Call(handle, uintptr(unsafe.Pointer(&entry)))
	if ret == 0 {
		return "[error: no processes found]"
	}

	var lines []string
	lines = append(lines, fmt.Sprintf("%-8s %-8s %s", "PID", "PPID", "NAME"))
	lines = append(lines, strings.Repeat("-", 50))

	for {
		name := syscall.UTF16ToString(entry.szExeFile[:])
		lines = append(lines, fmt.Sprintf("%-8d %-8d %s",
			entry.th32ProcessID,
			entry.th32ParentProcessID,
			name))

		ret, _, _ = procProcess32NextW.Call(handle, uintptr(unsafe.Pointer(&entry)))
		if ret == 0 {
			break
		}
	}

	return strings.Join(lines, "\n")
}

// =============================================================================
// NATIVE NETSTAT (no cmd.exe)
// =============================================================================

const (
	TCP_TABLE_OWNER_PID_ALL = 5
	UDP_TABLE_OWNER_PID     = 1
	AF_INET                 = 2
)

type tcpRow struct {
	State      uint32
	LocalAddr  uint32
	LocalPort  uint32
	RemoteAddr uint32
	RemotePort uint32
	OwningPid  uint32
}

type tcpTable struct {
	NumEntries uint32
	Table      [1]tcpRow
}

type udpRow struct {
	LocalAddr uint32
	LocalPort uint32
	OwningPid uint32
}

type udpTable struct {
	NumEntries uint32
	Table      [1]udpRow
}

func ipToString(ip uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d",
		ip&0xFF, (ip>>8)&0xFF, (ip>>16)&0xFF, (ip>>24)&0xFF)
}

func portToHost(port uint32) uint16 {
	return uint16((port>>8)&0xFF) | uint16((port&0xFF)<<8)
}

func tcpStateToString(state uint32) string {
	states := map[uint32]string{
		1: "CLOSED", 2: "LISTEN", 3: "SYN_SENT", 4: "SYN_RCVD",
		5: "ESTABLISHED", 6: "FIN_WAIT1", 7: "FIN_WAIT2", 8: "CLOSE_WAIT",
		9: "CLOSING", 10: "LAST_ACK", 11: "TIME_WAIT", 12: "DELETE_TCB",
	}
	if s, ok := states[state]; ok {
		return s
	}
	return fmt.Sprintf("UNKNOWN(%d)", state)
}

func nativeNetstat() string {
	var lines []string
	lines = append(lines, fmt.Sprintf("%-6s %-22s %-22s %-12s %-6s", "PROTO", "LOCAL", "REMOTE", "STATE", "PID"))
	lines = append(lines, strings.Repeat("-", 75))

	// TCP connections
	var size uint32
	procGetExtendedTcpTable.Call(0, uintptr(unsafe.Pointer(&size)), 1, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0)
	if size > 0 {
		buf := make([]byte, size)
		ret, _, _ := procGetExtendedTcpTable.Call(
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(unsafe.Pointer(&size)),
			1, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0)
		if ret == 0 {
			table := (*tcpTable)(unsafe.Pointer(&buf[0]))
			rows := (*[1 << 16]tcpRow)(unsafe.Pointer(&table.Table[0]))[:table.NumEntries]
			for _, row := range rows {
				local := fmt.Sprintf("%s:%d", ipToString(row.LocalAddr), portToHost(row.LocalPort))
				remote := fmt.Sprintf("%s:%d", ipToString(row.RemoteAddr), portToHost(row.RemotePort))
				lines = append(lines, fmt.Sprintf("%-6s %-22s %-22s %-12s %-6d",
					"TCP", local, remote, tcpStateToString(row.State), row.OwningPid))
			}
		}
	}

	// UDP connections
	size = 0
	procGetExtendedUdpTable.Call(0, uintptr(unsafe.Pointer(&size)), 1, AF_INET, UDP_TABLE_OWNER_PID, 0)
	if size > 0 {
		buf := make([]byte, size)
		ret, _, _ := procGetExtendedUdpTable.Call(
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(unsafe.Pointer(&size)),
			1, AF_INET, UDP_TABLE_OWNER_PID, 0)
		if ret == 0 {
			table := (*udpTable)(unsafe.Pointer(&buf[0]))
			rows := (*[1 << 16]udpRow)(unsafe.Pointer(&table.Table[0]))[:table.NumEntries]
			for _, row := range rows {
				local := fmt.Sprintf("%s:%d", ipToString(row.LocalAddr), portToHost(row.LocalPort))
				lines = append(lines, fmt.Sprintf("%-6s %-22s %-22s %-12s %-6d",
					"UDP", local, "*:*", "-", row.OwningPid))
			}
		}
	}

	return strings.Join(lines, "\n")
}
