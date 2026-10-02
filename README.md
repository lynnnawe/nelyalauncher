# nelya

a minecraft launcher. no client, just the launcher.

- vanilla, fabric, quilt, forge and neoforge instances
- microsoft sign in
- mods from modrinth with dependencies and one-click updates
- imports instances from prism, modrinth, curseforge, pandora and lunar
- optional sandbox per instance
- updates itself from github releases

## install

grab `Nelya-Setup.exe` from the [latest release](https://github.com/lynnnawe/nelyalauncher/releases/latest) and run it.
it installs the .net 9 runtime for you if it's missing.

windows 10 or 11, 64-bit.

## build it yourself

you need the [.net 9 sdk](https://dotnet.microsoft.com/download/dotnet/9.0).

```
dotnet publish Nelya.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o dist
```

that gives you `dist/Nelya.exe`. to build both the app and the installer in one go:

```
.\release.ps1 1.2.3 -BuildOnly
```

## how it's put together

| folder | what lives there |
| --- | --- |
| `Core/` | the launcher engine: versions, downloads, java, loaders, accounts, launching, mods, sandbox, updater |
| `web/` | the ui, served inside a webview2 window |
| `installer/` | `Nelya-Setup.exe`, a small .net framework 4.8 app so it runs before .net 9 is installed |
| `release.ps1` | bumps the version, builds everything and publishes a github release |

everything nelya saves goes in `%appdata%\nelya`.
