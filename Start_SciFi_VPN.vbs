Set WshShell = CreateObject("WScript.Shell")
strPath = Wscript.ScriptFullName
Set objFSO = CreateObject("Scripting.FileSystemObject")
strFolder = objFSO.GetParentFolderName(strPath) 
exePath = strFolder & "\SciFi_VPN_Backend.exe"
WshShell.CurrentDirectory = strFolder
WshShell.Run chr(34) & exePath & Chr(34), 0, False
