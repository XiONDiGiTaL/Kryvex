!macro customUnInstall
  ; Optional Default Apps registration created by electron/windows-browser.ts.
  DeleteRegKey HKCU "Software\Classes\KryvexURL"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Kryvex"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Kryvex"
!macroend
