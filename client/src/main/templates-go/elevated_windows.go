//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

type tokenElevation struct {
	TokenIsElevated uint32
}

func isElevated() bool {
	var token windows.Token
	err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token)
	if err != nil {
		return false
	}
	defer token.Close()
	var elevation tokenElevation
	var size uint32
	err = windows.GetTokenInformation(token, windows.TokenElevation, (*byte)(unsafe.Pointer(&elevation)), uint32(unsafe.Sizeof(elevation)), &size)
	if err != nil {
		return false
	}
	return elevation.TokenIsElevated != 0
}
