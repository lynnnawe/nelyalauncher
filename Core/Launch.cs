using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Nelya.Core;

sealed class Session
{
    public required string Id;
    public Process? Process;
    public DateTime Started = DateTime.UtcNow;
    public readonly CancellationTokenSource Cts = new();
    public readonly ConcurrentQueue<string> Pending = new();
    public readonly List<string> Tail = new();
    public bool Killed;
}

static class Launch
{
    static readonly ConcurrentDictionary<string, Session> Sessions = new();

    public static bool IsRunning(string id) => Sessions.ContainsKey(id);

    public static void Kill(string id)
    {
        if (!Sessions.TryGetValue(id, out var s)) return;
        s.Killed = true;
        s.Cts.Cancel();
        try
        {
            if (s.Process is { HasExited: false } p) p.Kill(true);
        }
        catch
        {
        }
    }

    static void State(string id, string state, string step) => Hub.Emit("game.state", new { id, state, step });

    public static void Start(string id, JsonObject opts)
    {
        if (Sessions.ContainsKey(id)) throw new InvalidOperationException("that instance is already running");
        var session = new Session { Id = id };
        Sessions[id] = session;
        _ = Task.Run(async () =>
        {
            try
            {
                await Run(session, opts);
            }
            catch (Exception ex)
            {
                Sessions.TryRemove(id, out _);
                var message = ex is OperationCanceledException ? "launch cancelled" : ex is InvalidOperationException ? ex.Message : "launch failed: " + ex.Message;
                Hub.Log(message, ex is OperationCanceledException ? "warn" : "error");
                Hub.Emit("game.exit", new { id, code = -1, failed = !(ex is OperationCanceledException), cancelled = ex is OperationCanceledException, error = message, played = 0 });
            }
        });
    }

    static async Task Run(Session session, JsonObject opts)
    {
        var id = session.Id;
        var ct = session.Cts.Token;
        var inst = Instances.Need(id);
        var name = Js.S(inst["name"]) ?? id;
        var game = Paths.Game(id);
        Directory.CreateDirectory(game);
        var settings = inst["settings"] as JsonObject ?? new JsonObject();
        var accountId = Js.S(opts["account"]) ?? Js.S(Hub.Settings["account"]);
        if (string.IsNullOrEmpty(accountId)) throw new InvalidOperationException("add a microsoft account before playing");

        State(id, "preparing", "resolving " + Js.S(inst["version"]));
        var versionId = await Instances.EnsureVersion(inst, ct);
        var r = await Meta.Resolve(versionId, ct);

        State(id, "downloading", "checking game files");
        var gameJob = await Meta.GameJob(r, name, ct);
        var (assetJob, indexId, index) = await Meta.AssetJob(r, name, ct);
        var javaChoice = Js.S(settings["java"]) ?? "auto";
        Task<string> javaTask = javaChoice == "auto" || !File.Exists(javaChoice)
            ? Java.Ensure(r.JavaComponent, name, ct)
            : Task.FromResult(javaChoice);
        await Task.WhenAll(Downloads.Run(gameJob, Math.Max(8, Hub.Threads), ct), Downloads.Run(assetJob, Math.Max(16, Hub.Threads * 2), ct), javaTask);
        var java = await javaTask;

        State(id, "starting", "preparing natives");
        var natives = Path.Combine(Paths.Instance(id), "natives");
        Meta.ExtractNatives(r, natives);
        var assetsRoot = Meta.AssetsRoot(indexId, index, game);
        Sync.BeforeLaunch(id);

        State(id, "starting", "signing in");
        var auth = await Launch_Auth(accountId, ct);

        var libs = Meta.Libraries(r).Where(l => l.Classpath && File.Exists(l.Path)).Select(l => l.Path).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        libs.Add(Meta.ClientJar(r));
        var classpath = string.Join(';', libs);

        var width = Js.S(settings["width"]);
        var height = Js.S(settings["height"]);
        var world = Js.S(opts["world"]);
        var server = Js.S(opts["server"]);
        var features = new Dictionary<string, bool>
        {
            ["has_custom_resolution"] = !string.IsNullOrWhiteSpace(width) && !string.IsNullOrWhiteSpace(height),
            ["is_quick_play_singleplayer"] = !string.IsNullOrEmpty(world),
            ["is_quick_play_multiplayer"] = !string.IsNullOrEmpty(server),
        };
        var vars = new Dictionary<string, string>
        {
            ["auth_player_name"] = auth.Name,
            ["version_name"] = versionId,
            ["game_directory"] = game,
            ["assets_root"] = assetsRoot,
            ["game_assets"] = assetsRoot,
            ["assets_index_name"] = indexId,
            ["auth_uuid"] = auth.Uuid,
            ["auth_access_token"] = auth.Token,
            ["auth_session"] = "token:" + auth.Token + ":" + auth.Uuid,
            ["auth_xuid"] = auth.Xuid,
            ["clientid"] = "",
            ["user_type"] = "msa",
            ["version_type"] = r.Type,
            ["user_properties"] = "{}",
            ["resolution_width"] = width ?? "854",
            ["resolution_height"] = height ?? "480",
            ["natives_directory"] = natives,
            ["launcher_name"] = "nelya",
            ["launcher_version"] = Hub.Version,
            ["classpath"] = classpath,
            ["classpath_separator"] = ";",
            ["library_directory"] = Paths.Libraries,
            ["quickPlayPath"] = Path.Combine(game, "quickPlay", "log.json"),
            ["quickPlaySingleplayer"] = world ?? "",
            ["quickPlayMultiplayer"] = server ?? "",
            ["quickPlayRealms"] = "",
        };
        string Sub(string s) => Regex.Replace(s, @"\$\{(\w+)\}", m => vars.TryGetValue(m.Groups[1].Value, out var v) ? v : "");
        List<string> Expand(IEnumerable<JsonNode> args)
        {
            var list = new List<string>();
            foreach (var a in args)
            {
                if (Js.S(a) is string s)
                {
                    list.Add(Sub(s));
                    continue;
                }
                if (a is not JsonObject o || !Rules.Allow(o["rules"] as JsonArray, features)) continue;
                if (Js.S(o["value"]) is string one) list.Add(Sub(one));
                else if (o["value"] is JsonArray many) list.AddRange(many.Select(x => Sub(Js.S(x) ?? "")));
            }
            return list;
        }

        var args = new List<string>();
        var maxMem = Js.D(settings["maxMem"]) ?? 4;
        var minMem = Js.D(settings["minMem"]) ?? 1;
        args.Add($"-Xms{(int)(Math.Min(minMem, maxMem) * 1024)}M");
        args.Add($"-Xmx{(int)(maxMem * 1024)}M");
        args.AddRange(SplitArgs(Js.S(settings["args"]) ?? ""));
        args.Add("-Dlog4j2.formatMsgNoLookups=true");
        var sandboxed = Js.B(settings["sandbox"]) ?? false;
        var sandboxTmp = Path.Combine(Paths.Instance(id), "tmp");
        if (sandboxed) args.Add("-Djava.io.tmpdir=" + sandboxTmp);
        if (r.JvmArgs.Count > 0) args.AddRange(Expand(r.JvmArgs));
        else args.AddRange(new[] { "-Djava.library.path=" + natives, "-Dminecraft.launcher.brand=nelya", "-Dminecraft.launcher.version=" + Hub.Version, "-cp", classpath });
        args.Add(r.MainClass);
        if (r.GameArgs.Count > 0) args.AddRange(Expand(r.GameArgs));
        else if (r.LegacyArgs != null) args.AddRange(r.LegacyArgs.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Sub));
        if ((Js.B(settings["fullscreen"]) ?? false) && !args.Contains("--fullscreen")) args.Add("--fullscreen");
        if (r.GameArgs.Count == 0 && features["has_custom_resolution"])
        {
            args.AddRange(new[] { "--width", width!, "--height", height! });
        }
        if (!string.IsNullOrEmpty(server) && !features["is_quick_play_multiplayer"] && r.GameArgs.Count == 0)
        {
            var parts = server.Split(':');
            args.AddRange(new[] { "--server", parts[0], "--port", parts.Length > 1 ? parts[1] : "25565" });
        }

        await Hook(Js.S(settings["pre"]), game, "pre-launch", ct);

        var wrapper = (Js.S(settings["wrapper"]) ?? "").Trim();
        var psi = new ProcessStartInfo(wrapper.Length > 0 ? wrapper : java)
        {
            WorkingDirectory = game,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        if (wrapper.Length > 0) psi.ArgumentList.Add(java);
        foreach (var a in args) psi.ArgumentList.Add(a);
        foreach (var pair in SplitArgs(Js.S(settings["env"]) ?? ""))
        {
            var eq = pair.IndexOf('=');
            if (eq > 0) psi.Environment[pair[..eq]] = pair[(eq + 1)..];
        }
        Hub.Log($"launching {name} with {Path.GetFileName(Path.GetDirectoryName(Path.GetDirectoryName(java)))}: {r.MainClass}");
        Hub.Log("java " + string.Join(' ', args.Select(a => a == auth.Token ? "***" : a.Contains(auth.Token) ? a.Replace(auth.Token, "***") : a).Select(a => a.Length > 160 ? a[..160] + "..." : a)));

        ct.ThrowIfCancellationRequested();
        Process process;
        void OnLine(string? line)
        {
            if (line == null) return;
            session.Pending.Enqueue(line);
            lock (session.Tail)
            {
                session.Tail.Add(line);
                if (session.Tail.Count > 400) session.Tail.RemoveAt(0);
            }
        }
        if (sandboxed)
        {
            State(id, "starting", "setting up the sandbox");
            var javaHome = Path.GetDirectoryName(Path.GetDirectoryName(java))!;
            var sid = Sandbox.Sid();
            await Task.Run(() => Sandbox.Grant(sid,
                new[] { Paths.Libraries, Paths.Versions, javaHome }.Concat(ArgPaths(Js.S(settings["args"]) ?? "")),
                new[] { game, natives, sandboxTmp, Paths.Assets, Paths.Sync }), ct);
            var env = new Dictionary<string, string> { ["TEMP"] = sandboxTmp, ["TMP"] = sandboxTmp };
            foreach (var pair in SplitArgs(Js.S(settings["env"]) ?? ""))
            {
                var eq = pair.IndexOf('=');
                if (eq > 0) env[pair[..eq]] = pair[(eq + 1)..];
            }
            Hub.Log("starting " + name + " inside the nelya sandbox");
            process = Sandbox.Start(wrapper.Length > 0 ? wrapper : java, wrapper.Length > 0 ? args.Prepend(java) : args, game, env, OnLine);
            process.EnableRaisingEvents = true;
        }
        else
        {
            process = new Process { StartInfo = psi, EnableRaisingEvents = true };
            process.OutputDataReceived += (_, e) => OnLine(e.Data);
            process.ErrorDataReceived += (_, e) => OnLine(e.Data);
            if (!process.Start()) throw new InvalidOperationException("java did not start");
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }
        session.Process = process;
        session.Started = DateTime.UtcNow;
        Hub.Emit("game.state", new { id, state = "running", step = "running", pid = process.Id });

        inst = Instances.Need(id);
        inst["lastPlayed"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        Instances.Save(inst);

        using var flusher = new System.Threading.Timer(_ => Flush(session), null, 100, 120);
        await process.WaitForExitAsync(CancellationToken.None);
        process.WaitForExit();
        Flush(session);

        var played = (long)(DateTime.UtcNow - session.Started).TotalSeconds;
        inst = Instances.Get(id) ?? inst;
        inst["playtime"] = (Js.L(inst["playtime"]) ?? 0) + played;
        inst["lastPlayed"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        Instances.Save(inst);
        Sessions.TryRemove(id, out _);
        try
        {
            Sync.AfterExit(id);
        }
        catch
        {
        }
        var code = process.ExitCode;
        List<string> tail;
        lock (session.Tail) tail = session.Tail.ToList();
        var crash = code != 0 && !session.Killed ? Crash.Detect(game, session.Started, tail) : null;
        Hub.Log($"{name} exited with code {code} after {played}s", code == 0 || session.Killed ? "info" : "error");
        _ = Hook(Js.S(settings["post"]), game, "post-exit", CancellationToken.None);
        Hub.Emit("game.exit", new { id, code, played, killed = session.Killed, crash });
    }

    static async Task<(string Name, string Uuid, string Token, string Xuid)> Launch_Auth(string accountId, CancellationToken ct)
    {
        try
        {
            return await Accounts.LaunchAuth(accountId, ct);
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("could not reach microsoft to sign in, check your connection");
        }
    }

    static void Flush(Session s)
    {
        if (s.Pending.IsEmpty) return;
        var lines = new List<string>();
        while (lines.Count < 400 && s.Pending.TryDequeue(out var line)) lines.Add(line);
        Hub.Emit("game.log", new { id = s.Id, lines });
    }

    static async Task Hook(string? command, string dir, string label, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(command)) return;
        try
        {
            var psi = new ProcessStartInfo("cmd.exe") { WorkingDirectory = dir, UseShellExecute = false, CreateNoWindow = true };
            psi.ArgumentList.Add("/c");
            psi.ArgumentList.Add(command.Replace("$INST_DIR", dir));
            using var p = Process.Start(psi)!;
            await p.WaitForExitAsync(ct);
            Hub.Log($"{label} command exited with code {p.ExitCode}");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Hub.Log($"{label} command failed: {ex.Message}", "warn");
        }
    }

    static IEnumerable<string> ArgPaths(string text)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        foreach (var arg in SplitArgs(text))
            foreach (Match m in Regex.Matches(arg, @"[A-Za-z]:[\\/][^;=""*?<>|]*"))
            {
                string full;
                try { full = Path.GetFullPath(m.Value.Trim()); } catch { continue; }
                if (File.Exists(full)) yield return full;
                else if (Directory.Exists(full) && Path.GetPathRoot(full) != full && !string.Equals(full.TrimEnd('\\'), home, StringComparison.OrdinalIgnoreCase)) yield return full;
            }
    }

    public static List<string> SplitArgs(string text)
    {
        var list = new List<string>();
        var sb = new StringBuilder();
        var quoted = false;
        foreach (var ch in text)
        {
            if (ch == '"') { quoted = !quoted; continue; }
            if (char.IsWhiteSpace(ch) && !quoted)
            {
                if (sb.Length > 0) { list.Add(sb.ToString()); sb.Clear(); }
                continue;
            }
            sb.Append(ch);
        }
        if (sb.Length > 0) list.Add(sb.ToString());
        return list;
    }
}

static class Crash
{
    static string? ModName(string game, string modId)
    {
        var dir = Path.Combine(game, "mods");
        if (!Directory.Exists(dir)) return null;
        foreach (var jar in Directory.EnumerateFiles(dir, "*.jar"))
        {
            try
            {
                using var zip = System.IO.Compression.ZipFile.OpenRead(jar);
                foreach (var entryName in new[] { "fabric.mod.json", "quilt.mod.json", "META-INF/mods.toml", "META-INF/neoforge.mods.toml" })
                {
                    var entry = zip.GetEntry(entryName);
                    if (entry == null) continue;
                    using var reader = new StreamReader(entry.Open());
                    var body = reader.ReadToEnd();
                    if (!Regex.IsMatch(body, @"[""']?(?:id|modId)[""']?\s*[:=]\s*[""']" + Regex.Escape(modId) + @"[""']")) continue;
                    var name = Regex.Match(body, @"[""']?(?:name|displayName)[""']?\s*[:=]\s*[""']([^""']+)[""']");
                    return name.Success ? name.Groups[1].Value : Path.GetFileNameWithoutExtension(jar);
                }
            }
            catch
            {
            }
        }
        return null;
    }

    public static object? Detect(string game, DateTime since, List<string> tail)
    {
        var dir = Path.Combine(game, "crash-reports");
        FileInfo? report = null;
        if (Directory.Exists(dir))
            report = new DirectoryInfo(dir).GetFiles("crash-*.txt")
                .Where(f => f.LastWriteTimeUtc >= since.AddSeconds(-5))
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .FirstOrDefault();
        var text = report != null ? File.ReadAllText(report.FullName) : string.Join('\n', tail);

        string? mod = null, modId = null;
        var suspected = Regex.Match(text, @"Suspected Mods?:\s*\n?\s*([^\n(]+?)\s*\(([^)\s]+)\)");
        if (suspected.Success && !suspected.Groups[1].Value.Trim().Equals("None", StringComparison.OrdinalIgnoreCase))
        {
            mod = suspected.Groups[1].Value.Trim();
            modId = suspected.Groups[2].Value.Trim();
        }
        if (modId == null)
        {
            foreach (var pattern in new[]
            {
                @"provided by '([a-z0-9_\-]+)'",
                @"from mod ([a-z0-9_\-]+)",
                @"Mixin apply for mod ([a-z0-9_\-]+)",
                @"mod ([a-z0-9_\-]+) failed to load",
                @"Failed to create mod instance\. ModID: ([a-z0-9_\-]+)",
                @"modid[:=]\s*""?([a-z0-9_\-]+)",
            })
            {
                var hit = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
                if (!hit.Success) continue;
                var candidate = hit.Groups[1].Value.ToLowerInvariant();
                if (candidate is "minecraft" or "java" or "fabricloader" or "forge" or "neoforge" or "mixinextras") continue;
                modId = candidate;
                break;
            }
        }
        if (modId != null && mod == null) mod = ModName(game, modId);
        if (modId == null)
        {
            var modFile = Regex.Match(text, @"Mod File:\s*.*?[/\\]([^/\\\n]+?)\.jar");
            if (modFile.Success) mod = modFile.Groups[1].Value;
        }
        if (modId == null && mod == null)
        {
            var depends = Regex.Match(text, @"Mod '([^']+)' \(([a-z0-9_\-]+)\)[^\n]*requires");
            if (depends.Success)
            {
                mod = depends.Groups[1].Value;
                modId = depends.Groups[2].Value;
            }
        }
        var description = Regex.Match(text, @"Description:\s*(.+)");
        var cause = Regex.Matches(text, @"(?:Caused by|Exception in thread[^:]*):\s*([^\n]+)").LastOrDefault();
        var reason = cause?.Groups[1].Value.Trim() ?? (description.Success ? description.Groups[1].Value.Trim() : null);
        if (reason == null)
        {
            var err = tail.LastOrDefault(l => l.Contains("/ERROR]") || l.Contains("Exception"));
            reason = err?.Trim();
        }
        var agent = tail.FirstOrDefault(l => l.Contains("Error opening zip file") || l.Contains("Agent_OnLoad") || l.Contains("agent library"));
        if (agent != null && reason == null) reason = "a -javaagent or agent library in the jvm arguments could not load: " + agent.Trim();
        if (reason != null && reason.Length > 240) reason = reason[..240] + "...";
        return new
        {
            mod = mod ?? modId,
            modId,
            reason = reason ?? "the game closed with an error",
            description = description.Success ? description.Groups[1].Value.Trim() : null,
            report = report?.FullName,
            file = report?.Name,
        };
    }
}
