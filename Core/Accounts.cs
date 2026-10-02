using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Nelya.Core;

sealed class AuthException(int status, string body) : Exception(body)
{
    public int Status { get; } = status;
    public string Body { get; } = body;
}

static class Accounts
{
    public const string ClientId = "00000000402b5328";
    public const string Redirect = "https://login.live.com/oauth20_desktop.srf";
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("nelya-accounts");
    static readonly SemaphoreSlim Gate = new(1, 1);

    static string FilePath => Path.Combine(Paths.Data, "accounts.dat");

    static JsonArray Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return new JsonArray();
            var raw = ProtectedData.Unprotect(File.ReadAllBytes(FilePath), Entropy, DataProtectionScope.CurrentUser);
            return JsonNode.Parse(raw) as JsonArray ?? new JsonArray();
        }
        catch
        {
            return new JsonArray();
        }
    }

    static void Save(JsonArray list)
    {
        Directory.CreateDirectory(Paths.Data);
        var bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(list.ToJsonString()), Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(FilePath, bytes);
    }

    static string SkinFile(string uuid) => Path.Combine(Paths.Cache, "skins", uuid + ".png");
    static string CapeFile(string id) => Path.Combine(Paths.Cache, "capes", id + ".png");

    static string? DataUrl(string path) =>
        File.Exists(path) ? "data:image/png;base64," + Convert.ToBase64String(File.ReadAllBytes(path)) : null;

    public static JsonArray Public()
    {
        var list = new JsonArray();
        foreach (var a in Load().OfType<JsonObject>())
        {
            var uuid = Js.S(a["uuid"])!;
            var capes = new JsonArray();
            if (a["capes"] is JsonArray cs)
                foreach (var c in cs.OfType<JsonObject>())
                    capes.Add(new JsonObject
                    {
                        ["id"] = Js.S(c["id"]),
                        ["alias"] = Js.S(c["alias"]),
                        ["active"] = Js.B(c["active"]) ?? false,
                        ["texture"] = DataUrl(CapeFile(Js.S(c["id"]) ?? "")),
                    });
            list.Add(new JsonObject
            {
                ["id"] = uuid,
                ["name"] = Js.S(a["name"]),
                ["type"] = "microsoft",
                ["slim"] = Js.B(a["slim"]) ?? false,
                ["skin"] = DataUrl(SkinFile(uuid)),
                ["capes"] = capes,
            });
        }
        return list;
    }

    public static void Remove(string uuid)
    {
        var list = Load();
        var found = list.OfType<JsonObject>().FirstOrDefault(a => Js.S(a["uuid"]) == uuid);
        if (found != null) list.Remove(found);
        Save(list);
    }

    static async Task<JsonDocument> Send(HttpMethod method, string url, object? body, string? bearer = null, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(method, url);
        req.Headers.Accept.ParseAdd("application/json");
        if (bearer != null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        if (body != null) req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        using var res = await Net.Http.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            Hub.Log($"{method} {new Uri(url).Host} answered {(int)res.StatusCode}: {(text.Length > 300 ? text[..300] : text)}", "warn");
            throw new AuthException((int)res.StatusCode, text);
        }
        return JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
    }

    static async Task<(string Access, string Refresh)> MsToken(Dictionary<string, string> form, CancellationToken ct)
    {
        using var content = new FormUrlEncodedContent(form);
        using var res = await Net.Http.PostAsync("https://login.live.com/oauth20_token.srf", content, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode) throw new AuthException((int)res.StatusCode, text);
        using var doc = JsonDocument.Parse(text);
        return (doc.RootElement.GetProperty("access_token").GetString()!, doc.RootElement.GetProperty("refresh_token").GetString()!);
    }

    static async Task<(string Token, string Xuid)> Minecraft(string msToken, Action<string>? step, CancellationToken ct)
    {
        step?.Invoke("xbox");
        string xbl, uhs;
        using (var doc = await Send(HttpMethod.Post, "https://user.auth.xboxlive.com/user/authenticate", new
        {
            Properties = new { AuthMethod = "RPS", SiteName = "user.auth.xboxlive.com", RpsTicket = "t=" + msToken },
            RelyingParty = "http://auth.xboxlive.com",
            TokenType = "JWT",
        }, null, ct))
        {
            xbl = doc.RootElement.GetProperty("Token").GetString()!;
            uhs = doc.RootElement.GetProperty("DisplayClaims").GetProperty("xui")[0].GetProperty("uhs").GetString()!;
        }
        string xsts, xuid = "";
        try
        {
            using var doc = await Send(HttpMethod.Post, "https://xsts.auth.xboxlive.com/xsts/authorize", new
            {
                Properties = new { SandboxId = "RETAIL", UserTokens = new[] { xbl } },
                RelyingParty = "rp://api.minecraftservices.com/",
                TokenType = "JWT",
            }, null, ct);
            xsts = doc.RootElement.GetProperty("Token").GetString()!;
            var xui = doc.RootElement.GetProperty("DisplayClaims").GetProperty("xui")[0];
            if (xui.TryGetProperty("xid", out var xid)) xuid = xid.GetString() ?? "";
        }
        catch (AuthException ex) when (ex.Status == 401)
        {
            throw new InvalidOperationException(ex.Body.Contains("2148916233") ? "this microsoft account has no xbox profile yet, sign in at minecraft.net once first"
                : ex.Body.Contains("2148916235") ? "xbox live is not available in your region"
                : ex.Body.Contains("2148916238") ? "child accounts need to be added to a family by an adult first"
                : "xbox live refused the sign in");
        }
        step?.Invoke("minecraft");
        using var mc = await Send(HttpMethod.Post, "https://api.minecraftservices.com/authentication/login_with_xbox", new { identityToken = $"XBL3.0 x={uhs};{xsts}" }, null, ct);
        return (mc.RootElement.GetProperty("access_token").GetString()!, xuid);
    }

    static async Task<JsonObject> Profile(string mcToken, CancellationToken ct)
    {
        JsonDocument doc;
        try
        {
            doc = await Send(HttpMethod.Get, "https://api.minecraftservices.com/minecraft/profile", null, mcToken, ct);
        }
        catch (AuthException ex) when (ex.Status == 404)
        {
            throw new InvalidOperationException("this account does not own minecraft java edition");
        }
        using (doc) return (JsonObject)JsonNode.Parse(doc.RootElement.GetRawText())!;
    }

    static async Task StoreProfile(JsonObject account, JsonObject profile, CancellationToken ct)
    {
        var uuid = Js.S(profile["id"])!;
        account["uuid"] = uuid;
        account["name"] = Js.S(profile["name"]);
        if (profile["skins"] is JsonArray skins)
        {
            var active = skins.OfType<JsonObject>().FirstOrDefault(s => Js.S(s["state"]) == "ACTIVE");
            if (active != null)
            {
                account["slim"] = Js.S(active["variant"]) == "SLIM";
                var url = Js.S(active["url"])?.Replace("http://", "https://");
                if (url != null && url != Js.S(account["skinUrl"]))
                {
                    try
                    {
                        var bytes = await Net.Http.GetByteArrayAsync(url, ct);
                        Directory.CreateDirectory(Path.GetDirectoryName(SkinFile(uuid))!);
                        await File.WriteAllBytesAsync(SkinFile(uuid), bytes, ct);
                        account["skinUrl"] = url;
                    }
                    catch
                    {
                    }
                }
            }
        }
        var capes = new JsonArray();
        if (profile["capes"] is JsonArray cs)
        {
            foreach (var c in cs.OfType<JsonObject>())
            {
                var id = Js.S(c["id"]);
                if (id == null) continue;
                var url = Js.S(c["url"])?.Replace("http://", "https://");
                if (url != null && !File.Exists(CapeFile(id)))
                {
                    try
                    {
                        var bytes = await Net.Http.GetByteArrayAsync(url, ct);
                        Directory.CreateDirectory(Path.GetDirectoryName(CapeFile(id))!);
                        await File.WriteAllBytesAsync(CapeFile(id), bytes, ct);
                    }
                    catch
                    {
                    }
                }
                capes.Add(new JsonObject { ["id"] = id, ["alias"] = Js.S(c["alias"]), ["active"] = Js.S(c["state"]) == "ACTIVE" });
            }
        }
        account["capes"] = capes;
    }

    static CancellationTokenSource? device;

    public static async Task<JsonObject> StartDevice()
    {
        device?.Cancel();
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = ClientId,
            ["scope"] = "service::user.auth.xboxlive.com::MBI_SSL",
            ["response_type"] = "device_code",
        });
        using var res = await Net.Http.PostAsync("https://login.live.com/oauth20_connect.srf", content);
        var text = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException("microsoft did not give a sign in code, try again");
        var node = JsonNode.Parse(text)!;
        var code = Js.S(node["user_code"])!;
        var deviceCode = Js.S(node["device_code"])!;
        var interval = (int)(Js.L(node["interval"]) ?? 5);
        var expires = (int)(Js.L(node["expires_in"]) ?? 900);
        var cts = new CancellationTokenSource(TimeSpan.FromSeconds(expires));
        device = cts;
        _ = Task.Run(() => PollDevice(deviceCode, interval, cts));
        return new JsonObject
        {
            ["code"] = code,
            ["url"] = Js.S(node["verification_uri"]) ?? "https://www.microsoft.com/link",
            ["expires"] = expires,
        };
    }

    public static void CancelDevice()
    {
        device?.Cancel();
        device = null;
    }

    static async Task PollDevice(string deviceCode, int interval, CancellationTokenSource cts)
    {
        var ct = cts.Token;
        try
        {
            while (true)
            {
                await Task.Delay(TimeSpan.FromSeconds(interval), ct);
                using var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = ClientId,
                    ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code",
                    ["device_code"] = deviceCode,
                });
                using var res = await Net.Http.PostAsync("https://login.live.com/oauth20_token.srf", content, ct);
                var text = await res.Content.ReadAsStringAsync(ct);
                var node = JsonNode.Parse(text)!;
                if (res.IsSuccessStatusCode)
                {
                    var access = Js.S(node["access_token"])!;
                    var refresh = Js.S(node["refresh_token"]) ?? "";
                    Hub.Emit("login.step", new { step = "xbox" });
                    var account = await Finish(access, refresh, step => Hub.Emit("login.step", new { step }), CancellationToken.None);
                    Hub.Emit("login.done", new { ok = true, account });
                    return;
                }
                var error = Js.S(node["error"]);
                if (error == "authorization_pending") continue;
                if (error == "slow_down")
                {
                    interval += 5;
                    continue;
                }
                Hub.Emit("login.done", new
                {
                    ok = false,
                    error = error switch
                    {
                        "access_denied" or "authorization_declined" => "you declined the sign in",
                        "expired_token" or "bad_verification_code" => "the code expired, try again",
                        _ => "microsoft refused the sign in",
                    },
                });
                return;
            }
        }
        catch (OperationCanceledException)
        {
            if (ReferenceEquals(device, cts)) Hub.Emit("login.done", new { ok = false, error = "the code expired, try again" });
        }
        catch (Exception ex)
        {
            var message = ex is InvalidOperationException ? ex.Message
                : ex is AuthException ? "microsoft refused the sign in, try again"
                : "could not reach microsoft";
            Hub.Log("sign in failed: " + ex.Message, "warn");
            Hub.Emit("login.done", new { ok = false, error = message });
        }
    }

    public static async Task<JsonObject> LoginWithCode(string code, Action<string>? step)
    {
        step?.Invoke("xbox");
        var (access, refresh) = await MsToken(new Dictionary<string, string>
        {
            ["client_id"] = ClientId,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = Redirect,
            ["scope"] = "service::user.auth.xboxlive.com::MBI_SSL",
        }, CancellationToken.None);
        return await Finish(access, refresh, step, CancellationToken.None);
    }

    static async Task<JsonObject> Finish(string access, string refresh, Action<string>? step, CancellationToken ct)
    {
        var (mcToken, xuid) = await Minecraft(access, step, ct);
        step?.Invoke("profile");
        var profile = await Profile(mcToken, ct);
        await Gate.WaitAsync(ct);
        try
        {
            var list = Load();
            var uuid = Js.S(profile["id"])!;
            var account = list.OfType<JsonObject>().FirstOrDefault(a => Js.S(a["uuid"]) == uuid);
            if (account == null)
            {
                account = new JsonObject();
                list.Add(account);
            }
            account["refresh"] = refresh;
            account["mcToken"] = mcToken;
            account["mcExpires"] = DateTimeOffset.UtcNow.AddHours(23).ToUnixTimeMilliseconds();
            account["xuid"] = xuid;
            await StoreProfile(account, profile, ct);
            Save(list);
            Hub.Log("signed in as " + Js.S(account["name"]));
            return Public().OfType<JsonObject>().First(a => Js.S(a["id"]) == uuid);
        }
        finally
        {
            Gate.Release();
        }
    }

    public static async Task<(string Name, string Uuid, string Token, string Xuid)> LaunchAuth(string uuid, CancellationToken ct = default)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var list = Load();
            var account = list.OfType<JsonObject>().FirstOrDefault(a => Js.S(a["uuid"]) == uuid)
                ?? throw new InvalidOperationException("that account is not signed in anymore");
            var expires = Js.L(account["mcExpires"]) ?? 0;
            if (expires < DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeMilliseconds())
            {
                Hub.Log("refreshing the minecraft session for " + Js.S(account["name"]));
                (string access, string refresh) tokens;
                try
                {
                    tokens = await MsToken(new Dictionary<string, string>
                    {
                        ["client_id"] = ClientId,
                        ["refresh_token"] = Js.S(account["refresh"]) ?? "",
                        ["grant_type"] = "refresh_token",
                        ["scope"] = "service::user.auth.xboxlive.com::MBI_SSL",
                    }, ct);
                }
                catch (AuthException)
                {
                    throw new InvalidOperationException("your microsoft sign in expired, remove the account and add it again");
                }
                var (mcToken, xuid) = await Minecraft(tokens.access, null, ct);
                account["refresh"] = tokens.refresh;
                account["mcToken"] = mcToken;
                account["mcExpires"] = DateTimeOffset.UtcNow.AddHours(23).ToUnixTimeMilliseconds();
                if (xuid.Length > 0) account["xuid"] = xuid;
                try
                {
                    await StoreProfile(account, await Profile(mcToken, ct), ct);
                }
                catch
                {
                }
                Save(list);
            }
            return (Js.S(account["name"])!, uuid, Js.S(account["mcToken"])!, Js.S(account["xuid"]) ?? "");
        }
        finally
        {
            Gate.Release();
        }
    }

    public static async Task<JsonObject> UploadSkin(string uuid, byte[] png, bool slim, CancellationToken ct = default)
    {
        var (_, _, token, _) = await LaunchAuth(uuid, ct);
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(slim ? "slim" : "classic"), "variant");
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "skin.png");
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.minecraftservices.com/minecraft/profile/skins") { Content = form };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await Net.Http.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (res.StatusCode == HttpStatusCode.TooManyRequests) throw new InvalidOperationException("mojang is rate limiting skin changes, try again in a minute");
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException("mojang refused the skin");
        return await RefreshProfile(uuid, (JsonObject)JsonNode.Parse(text)!, ct);
    }

    public static async Task<JsonObject> SetCape(string uuid, string? capeId, CancellationToken ct = default)
    {
        var (_, _, token, _) = await LaunchAuth(uuid, ct);
        JsonDocument doc;
        if (string.IsNullOrEmpty(capeId))
            doc = await Send(HttpMethod.Delete, "https://api.minecraftservices.com/minecraft/profile/capes/active", null, token, ct);
        else
            doc = await Send(HttpMethod.Put, "https://api.minecraftservices.com/minecraft/profile/capes/active", new { capeId }, token, ct);
        using (doc) return await RefreshProfile(uuid, (JsonObject)JsonNode.Parse(doc.RootElement.GetRawText())!, ct);
    }

    static async Task<JsonObject> RefreshProfile(string uuid, JsonObject profile, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var list = Load();
            var account = list.OfType<JsonObject>().First(a => Js.S(a["uuid"]) == uuid);
            if (profile["id"] == null)
            {
                profile = await Profile(Js.S(account["mcToken"])!, ct);
            }
            account["skinUrl"] = null;
            await StoreProfile(account, profile, ct);
            Save(list);
        }
        finally
        {
            Gate.Release();
        }
        return Public().OfType<JsonObject>().First(a => Js.S(a["id"]) == uuid);
    }
}
