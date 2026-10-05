using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace Nelya.Core;

public static class Updater
{
    public const string Repo = "lynnnawe/nelyalauncher";
    const string Asset = "Nelya.exe";
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\nelya";

    static readonly SemaphoreSlim Gate = new(1, 1);
    static string? latest;
    static string? notes;
    static string? page;
    static string? assetUrl;
    static long assetSize;
    static string? assetDigest;
    static string? pending;
    static string? error;
    static bool downloading;
    static DateTime checkedAt;

    public static bool Restart;
    public static bool JustUpdated;
    public static bool CanUpdate => Exe != null;
    public static bool HasNewer => Newer && assetUrl != null;
    public static string? Latest => latest;

    static string Marker => Path.Combine(Paths.Cache, "update", "pending.json");

    static string Sha256(string file)
    {
        using var stream = File.OpenRead(file);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    public static bool ApplyLeftover()
    {
        if (Exe == null || !File.Exists(Marker)) return false;
        try
        {
            var saved = Js.Read(Marker) as JsonObject;
            var version = Js.S(saved?["version"]);
            var file = Js.S(saved?["file"]);
            var sha = Js.S(saved?["sha256"]);
            if (version == null || file == null || !File.Exists(file) || Parse(version) <= Parse(Hub.Version) || (sha != null && Sha256(file) != sha))
            {
                File.Delete(Marker);
                return false;
            }
            pending = file;
            Restart = true;
            ApplyPending();
            return pending == null;
        }
        catch
        {
            return false;
        }
    }

    static string? Exe
    {
        get
        {
            var path = Environment.ProcessPath;
            return path != null && Path.GetFileName(path).Equals(Asset, StringComparison.OrdinalIgnoreCase) ? path : null;
        }
    }

    public static void Start(bool updated)
    {
        JustUpdated = updated;
        _ = Task.Run(async () =>
        {
            for (var i = 0; i < 10 && Exe is string exe && File.Exists(exe + ".old"); i++)
            {
                try { File.Delete(exe + ".old"); }
                catch { await Task.Delay(1500); }
            }
            if (updated) SetInstalledVersion();
            await Task.Delay(TimeSpan.FromSeconds(8));
            while (true)
            {
                try
                {
                    await Check(false);
                    if (Newer && pending == null && (Js.B(Hub.Settings["autoUpdate"]) ?? true)) await Download();
                }
                catch (Exception ex)
                {
                    Hub.Log("update check failed: " + ex.Message, "warn");
                }
                await Task.Delay(TimeSpan.FromHours(6));
            }
        });
    }

    static bool Newer => latest != null && Parse(latest) > Parse(Hub.Version);

    static Version Parse(string v)
    {
        var clean = v.Trim().TrimStart('v', 'V');
        var cut = clean.IndexOfAny(new[] { '-', '+', ' ' });
        if (cut > 0) clean = clean[..cut];
        return Version.TryParse(clean, out var parsed) ? parsed : new Version(0, 0);
    }

    public static object State() => new
    {
        current = Hub.Version,
        latest,
        newer = Newer,
        ready = pending != null,
        downloading,
        error,
        notes,
        page,
        repo = Repo,
        portable = Exe == null,
        justUpdated = JustUpdated,
        checkedAt = checkedAt == default ? (long?)null : new DateTimeOffset(checkedAt).ToUnixTimeMilliseconds(),
    };

    public static async Task<object> Check(bool force)
    {
        if (!force && DateTime.UtcNow - checkedAt < TimeSpan.FromMinutes(10)) return State();
        await Gate.WaitAsync();
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, Environment.GetEnvironmentVariable("NELYA_UPDATE_FEED") ?? $"https://api.github.com/repos/{Repo}/releases/latest");
            req.Headers.Accept.ParseAdd("application/vnd.github+json");
            using var res = await Net.Http.SendAsync(req);
            checkedAt = DateTime.UtcNow;
            if (res.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                error = "no releases published yet";
                return State();
            }
            res.EnsureSuccessStatusCode();
            var release = JsonNode.Parse(await res.Content.ReadAsStringAsync()) as JsonObject ?? throw new InvalidOperationException("github sent nothing back");
            error = null;
            latest = (Js.S(release["tag_name"]) ?? Hub.Version).TrimStart('v', 'V');
            notes = Js.S(release["body"]);
            page = Js.S(release["html_url"]);
            var asset = (release["assets"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(x => string.Equals(Js.S(x["name"]), Asset, StringComparison.OrdinalIgnoreCase));
            assetUrl = Js.S(asset?["browser_download_url"]);
            assetSize = Js.L(asset?["size"]) ?? 0;
            assetDigest = Js.S(asset?["digest"]);
            if (Newer && assetUrl == null) error = $"release {latest} has no {Asset} attached";
            if (Newer)
            {
                Hub.Log($"nelya {latest} is available (you have {Hub.Version})");
                Hub.Emit("update.available", State());
            }
            return State();
        }
        catch (Exception ex)
        {
            error = ex.Message;
            throw;
        }
        finally
        {
            Gate.Release();
        }
    }

    public static async Task<object> Download()
    {
        if (Exe == null) throw new InvalidOperationException("updates only work on the installed Nelya.exe");
        if (!Newer) await Check(true);
        if (!Newer) return State();
        if (pending != null && File.Exists(pending)) return State();
        if (assetUrl == null) throw new InvalidOperationException(error ?? "the release has no download");
        if (downloading) return State();
        downloading = true;
        Hub.Emit("update.state", State());
        try
        {
            var dir = Path.Combine(Paths.Cache, "update");
            Directory.CreateDirectory(dir);
            foreach (var stale in Directory.GetFiles(dir)) try { File.Delete(stale); } catch { }
            var file = Path.Combine(dir, $"Nelya-{latest}.exe");
            var job = new Job { Name = "nelya " + latest, Target = "launcher update", Kind = "update" };
            job.Files.Add(new DlFile { Url = assetUrl, Path = file, Size = assetSize });
            await Downloads.Run(job);
            if (assetDigest != null && assetDigest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase))
            {
                await using var stream = File.OpenRead(file);
                var hash = Convert.ToHexString(await SHA256.HashDataAsync(stream)).ToLowerInvariant();
                if (hash != assetDigest[7..].ToLowerInvariant())
                {
                    stream.Close();
                    File.Delete(file);
                    throw new InvalidOperationException("the downloaded update did not match github's checksum");
                }
            }
            var info = FileVersionInfo.GetVersionInfo(file);
            if (!string.Equals(info.ProductName, "nelya", StringComparison.OrdinalIgnoreCase) && !string.Equals(info.OriginalFilename, Asset, StringComparison.OrdinalIgnoreCase))
            {
                File.Delete(file);
                throw new InvalidOperationException("the downloaded file is not nelya");
            }
            pending = file;
            error = null;
            try { File.WriteAllText(Marker, new JsonObject { ["version"] = latest, ["file"] = file, ["sha256"] = Sha256(file) }.ToJsonString()); } catch { }
            Hub.Log($"nelya {latest} downloaded, it installs when nelya closes");
            Hub.Emit("update.ready", State());
            return State();
        }
        catch (Exception ex)
        {
            error = ex.Message;
            throw;
        }
        finally
        {
            downloading = false;
            Hub.Emit("update.state", State());
        }
    }

    public static void ApplyPending()
    {
        var exe = Exe;
        if (exe == null || pending == null || !File.Exists(pending)) return;
        var old = exe + ".old";
        try
        {
            if (File.Exists(old)) File.Delete(old);
            File.Move(exe, old);
            File.Move(pending, exe);
            pending = null;
            try { File.Delete(Marker); } catch { }
        }
        catch (Exception ex)
        {
            try
            {
                if (!File.Exists(exe) && File.Exists(old)) File.Move(old, exe);
            }
            catch { }
            Restart = false;
            Hub.Log("could not install the update: " + ex.Message, "error");
            return;
        }
        if (Restart)
        {
            try { Process.Start(new ProcessStartInfo(exe, "--updated") { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(exe)! }); }
            catch { }
        }
    }

    static void SetInstalledVersion()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(UninstallKey, writable: true);
            key?.SetValue("DisplayVersion", Hub.Version);
        }
        catch { }
    }
}
