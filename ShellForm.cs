using System.Collections.Specialized;
using System.Diagnostics;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Nelya;

sealed class ShellForm : Form
{
    const string Origin = "https://app.nelya/";
    const int WM_NCCALCSIZE = 0x0083;
    const int WM_NCLBUTTONDOWN = 0x00A1;
    const int WM_SIZE = 0x0005;

    static readonly Dictionary<string, string> Resources = Assembly.GetExecutingAssembly()
        .GetManifestResourceNames()
        .Where(n => n.StartsWith("web/"))
        .ToDictionary(n => n.Substring(4).Replace('\\', '/').ToLowerInvariant(), n => n);

    static readonly Dictionary<string, string> Mime = new()
    {
        [".html"] = "text/html; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".json"] = "application/json",
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".webp"] = "image/webp",
        [".txt"] = "text/plain; charset=utf-8",
        [".log"] = "text/plain; charset=utf-8",
        [".woff2"] = "font/woff2",
        [".ttf"] = "font/ttf",
    };

    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(12) };

    readonly CoreWebView2Environment environment;
    readonly WebView2 view;
    readonly string page;
    readonly bool resizable;
    bool started;
    FormWindowState lastState;
    NotifyIcon? tray;

    public event Action<ShellForm, string, string?>? Received;

    public ShellForm(CoreWebView2Environment environment, string page, Size size, bool resizable)
    {
        this.environment = environment;
        this.page = page;
        this.resizable = resizable;

        Text = "nelya";
        BackColor = Color.FromArgb(9, 8, 13);
        FormBorderStyle = resizable ? FormBorderStyle.Sizable : FormBorderStyle.FixedSingle;
        MaximizeBox = resizable;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        Size = size;
        ShowIcon = true;
        using (var ico = Assembly.GetExecutingAssembly().GetManifestResourceStream("nelya.ico"))
            if (ico != null) Icon = new Icon(ico);

        view = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(9, 8, 13),
        };
        Controls.Add(view);
        lastState = WindowState;
    }

    public void Preload()
    {
        _ = Handle;
        _ = view.Handle;
        _ = InitAsync();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int dark = 1;
        DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
        int round = 2;
        DwmSetWindowAttribute(Handle, 33, ref round, sizeof(int));
        int border = 0x002A2027;
        DwmSetWindowAttribute(Handle, 34, ref border, sizeof(int));
        int caption = 0x000D0809;
        DwmSetWindowAttribute(Handle, 35, ref caption, sizeof(int));
        SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0020);
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (!started) _ = InitAsync();
    }

    async Task InitAsync()
    {
        if (started) return;
        started = true;
        await view.EnsureCoreWebView2Async(environment);
        var core = view.CoreWebView2;
        var s = core.Settings;
        s.AreDefaultContextMenusEnabled = false;
        s.AreDevToolsEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsStatusBarEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false;
        s.IsPinchZoomEnabled = false;
        s.IsSwipeNavigationEnabled = false;
        s.IsGeneralAutofillEnabled = false;
        s.IsPasswordAutosaveEnabled = false;

        core.AddWebResourceRequestedFilter(Origin + "*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += OnResource;
        core.WebMessageReceived += OnWebMessage;
        core.NewWindowRequested += (_, a) => a.Handled = true;
        core.Navigate(Origin + page);
    }

    void OnResource(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var raw = Uri.UnescapeDataString(new Uri(e.Request.Uri).AbsolutePath.TrimStart('/'));
        if (raw.StartsWith("data/", StringComparison.OrdinalIgnoreCase))
        {
            var full = Path.GetFullPath(Path.Combine(Nelya.Core.Paths.Root, raw[5..].Replace('/', Path.DirectorySeparatorChar)));
            if (!Nelya.Core.Paths.Inside(full, Nelya.Core.Paths.Root) || !File.Exists(full))
            {
                e.Response = environment.CreateWebResourceResponse(null, 404, "Not Found", "");
                return;
            }
            Mime.TryGetValue(Path.GetExtension(full).ToLowerInvariant(), out var fileType);
            var fs = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            e.Response = environment.CreateWebResourceResponse(fs, 200, "OK", $"Content-Type: {fileType ?? "application/octet-stream"}\nCache-Control: no-store");
            return;
        }
        var path = new Uri(e.Request.Uri).AbsolutePath.TrimStart('/').ToLowerInvariant();
        if (path.Length == 0) path = page;
        if (!Resources.TryGetValue(path, out var name))
        {
            e.Response = environment.CreateWebResourceResponse(null, 404, "Not Found", "");
            return;
        }
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)!;
        Mime.TryGetValue(Path.GetExtension(path), out var type);
        e.Response = environment.CreateWebResourceResponse(stream, 200, "OK", $"Content-Type: {type ?? "application/octet-stream"}\nCache-Control: no-store");
    }

    void ToTray()
    {
        if (tray == null)
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("open nelya", null, (_, _) => FromTray());
            menu.Items.Add("quit", null, (_, _) => { FromTray(); Close(); });
            tray = new NotifyIcon { Icon = Icon, Text = "nelya", ContextMenuStrip = menu };
            tray.MouseClick += (_, a) => { if (a.Button == MouseButtons.Left) FromTray(); };
        }
        tray.Visible = true;
        Hide();
    }

    void FromTray()
    {
        if (tray != null) tray.Visible = false;
        if (!Visible) Show();
        if (WindowState == FormWindowState.Minimized) WindowState = lastState == FormWindowState.Maximized ? FormWindowState.Maximized : FormWindowState.Normal;
        Activate();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        if (tray != null)
        {
            tray.Visible = false;
            tray.Dispose();
        }
        base.OnFormClosed(e);
    }

    void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string type;
        string? value = null;
        JsonObject? message;
        try
        {
            message = JsonNode.Parse(e.WebMessageAsJson) as JsonObject;
            type = Nelya.Core.Js.S(message?["type"]) ?? "";
            var v = message?["value"];
            if (v != null) value = Nelya.Core.Js.S(v) ?? v.ToJsonString();
        }
        catch
        {
            return;
        }
        if (type == "call" && message != null)
        {
            var callId = Nelya.Core.Js.S(message["id"]) ?? "";
            var method = Nelya.Core.Js.S(message["method"]) ?? "";
            var args = message["args"] as JsonObject ?? new JsonObject();
            _ = CallAsync(callId, method, (JsonObject)args.DeepClone());
            return;
        }

        switch (type)
        {
            case "drag":
                if (IsZoomed(Handle) && value != null && double.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var ratio))
                {
                    var cursor = Cursor.Position;
                    WindowState = FormWindowState.Normal;
                    Location = new Point(cursor.X - (int)(Width * ratio), cursor.Y - 18);
                }
                ReleaseCapture();
                SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)2, IntPtr.Zero);
                break;
            case "resize":
                if (!resizable || IsZoomed(Handle)) break;
                var code = value switch
                {
                    "l" => 10, "r" => 11, "t" => 12, "tl" => 13, "tr" => 14, "b" => 15, "bl" => 16, "br" => 17, _ => 0
                };
                if (code == 0) break;
                ReleaseCapture();
                SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)code, IntPtr.Zero);
                break;
            case "minimize":
                WindowState = FormWindowState.Minimized;
                break;
            case "dock":
                ToTray();
                break;
            case "undock":
                FromTray();
                break;
            case "maximize":
                if (resizable) WindowState = IsZoomed(Handle) ? FormWindowState.Normal : FormWindowState.Maximized;
                break;
            case "close":
                Close();
                break;
            case "log:copy":
            case "log:open":
                try
                {
                    var dir = Nelya.Core.Paths.Logs;
                    Directory.CreateDirectory(dir);
                    var file = Path.Combine(dir, "latest.log");
                    File.WriteAllText(file, value ?? "");
                    if (type == "log:copy") Clipboard.SetFileDropList(new StringCollection { file });
                    else Process.Start("explorer.exe", $"/select,\"{file}\"");
                }
                catch { }
                break;
            case "ms:login":
                _ = MicrosoftLoginAsync();
                break;
            case "clip:image":
                try
                {
                    if (value != null && Nelya.Core.Paths.Inside(value, Nelya.Core.Paths.Root) && File.Exists(value))
                    {
                        using var img = Image.FromFile(value);
                        Clipboard.SetImage(new Bitmap(img));
                    }
                }
                catch { }
                break;
            case "clip:text":
                try
                {
                    if (!string.IsNullOrEmpty(value)) Clipboard.SetText(value);
                }
                catch { }
                break;
            case "shortcut":
                try
                {
                    if (value != null) CreateShortcut(value);
                }
                catch { }
                break;
            case "skin:fetch":
                if (value != null)
                {
                    var bar = value.IndexOf('|');
                    if (bar > 0) _ = FetchSkinAsync(value[..bar], value[(bar + 1)..].Trim());
                }
                break;
            default:
                Received?.Invoke(this, type, value);
                break;
        }
    }

    public void Post(string type)
    {
        if (view.CoreWebView2 == null) return;
        view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type }));
    }

    void PostJson(object payload)
    {
        if (view.CoreWebView2 == null || IsDisposed) return;
        view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
    }

    bool signingIn;

    async Task MicrosoftLoginAsync()
    {
        if (signingIn) return;
        signingIn = true;
        try
        {
            Nelya.Core.Hub.Emit("login.step", new { step = "microsoft" });
            var code = await LoginForm.GetCodeAsync(this, environment);
            if (string.IsNullOrEmpty(code))
            {
                Nelya.Core.Hub.Emit("login.done", new { ok = false, error = "sign in was cancelled" });
                return;
            }
            var account = await Task.Run(() => Nelya.Core.Accounts.LoginWithCode(code, step => Nelya.Core.Hub.Emit("login.step", new { step })));
            Nelya.Core.Hub.Emit("login.done", new { ok = true, account });
        }
        catch (Exception ex)
        {
            var message = ex is InvalidOperationException ? ex.Message
                : ex is Nelya.Core.AuthException ? "microsoft refused the sign in, try again"
                : ex is TaskCanceledException ? "the servers took too long to answer"
                : "could not reach microsoft";
            Nelya.Core.Hub.Log("sign in failed: " + ex.Message, "warn");
            Nelya.Core.Hub.Emit("login.done", new { ok = false, error = message });
        }
        finally
        {
            signingIn = false;
        }
    }

    async Task CallAsync(string id, string method, JsonObject args)
    {
        object? data;
        try
        {
            data = await Task.Run(() => Nelya.Core.Bridge.Call(method, args));
        }
        catch (Exception ex)
        {
            var error = ex is InvalidOperationException ? ex.Message : ex is HttpRequestException ? "could not reach the server, check your connection" : ex.Message;
            PostJson(new { type = "reply", id, ok = false, error });
            return;
        }
        PostJson(new { type = "reply", id, ok = true, data });
    }

    public void AttachHub()
    {
        Nelya.Core.Hub.Sink = json =>
        {
            if (IsDisposed || !IsHandleCreated) return;
            try
            {
                BeginInvoke(() =>
                {
                    if (!IsDisposed && view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(json);
                });
            }
            catch
            {
            }
        };
    }

    async Task FetchSkinAsync(string id, string name)
    {
        try
        {
            if (!Regex.IsMatch(name, "^[A-Za-z0-9_]{1,16}$")) throw new InvalidOperationException("that is not a valid username");
            using var lookup = await Http.GetAsync("https://api.mojang.com/users/profiles/minecraft/" + name);
            if (lookup.StatusCode == HttpStatusCode.NotFound || lookup.StatusCode == HttpStatusCode.NoContent) throw new InvalidOperationException("no player with that name");
            if (lookup.StatusCode == HttpStatusCode.TooManyRequests) throw new InvalidOperationException("mojang is rate limiting, try again in a minute");
            lookup.EnsureSuccessStatusCode();
            using var who = JsonDocument.Parse(await lookup.Content.ReadAsStringAsync());
            var uuid = who.RootElement.GetProperty("id").GetString();
            var realName = who.RootElement.GetProperty("name").GetString() ?? name;

            using var profile = JsonDocument.Parse(await Http.GetStringAsync("https://sessionserver.mojang.com/session/minecraft/profile/" + uuid));
            string? skinUrl = null;
            string? capeUrl = null;
            var slim = false;
            foreach (var prop in profile.RootElement.GetProperty("properties").EnumerateArray())
            {
                if (prop.GetProperty("name").GetString() != "textures") continue;
                var json = Encoding.UTF8.GetString(Convert.FromBase64String(prop.GetProperty("value").GetString() ?? ""));
                using var tex = JsonDocument.Parse(json);
                var textures = tex.RootElement.GetProperty("textures");
                if (textures.TryGetProperty("SKIN", out var skin))
                {
                    skinUrl = skin.GetProperty("url").GetString();
                    if (skin.TryGetProperty("metadata", out var meta) && meta.TryGetProperty("model", out var model)) slim = model.GetString() == "slim";
                }
                if (textures.TryGetProperty("CAPE", out var cape)) capeUrl = cape.GetProperty("url").GetString();
            }
            if (skinUrl == null) throw new InvalidOperationException(realName + " uses a default skin");
            var bytes = await Http.GetByteArrayAsync(skinUrl.Replace("http://", "https://"));
            string? capeData = null;
            if (capeUrl != null)
            {
                try { capeData = Convert.ToBase64String(await Http.GetByteArrayAsync(capeUrl.Replace("http://", "https://"))); } catch { }
            }
            PostJson(new { type = "skin:result", id, ok = true, name = realName, uuid, slim, data = Convert.ToBase64String(bytes), cape = capeData });
        }
        catch (Exception ex)
        {
            var message = ex is InvalidOperationException ? ex.Message : ex is TaskCanceledException ? "mojang took too long to answer" : "could not reach mojang";
            PostJson(new { type = "skin:result", id, ok = false, error = message });
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_NCCALCSIZE && m.WParam != IntPtr.Zero)
        {
            if (IsZoomed(Handle))
            {
                var p = Marshal.PtrToStructure<NCCALCSIZE_PARAMS>(m.LParam);
                var proposed = Rectangle.FromLTRB(p.rgrc0.left, p.rgrc0.top, p.rgrc0.right, p.rgrc0.bottom);
                var area = Screen.FromRectangle(proposed).WorkingArea;
                p.rgrc0 = new RECT { left = area.Left, top = area.Top, right = area.Right, bottom = area.Bottom };
                Marshal.StructureToPtr(p, m.LParam, false);
            }
            m.Result = IntPtr.Zero;
            return;
        }
        base.WndProc(ref m);
        if (m.Msg == WM_SIZE)
        {
            var state = (int)m.WParam switch { 2 => FormWindowState.Maximized, 1 => FormWindowState.Minimized, _ => FormWindowState.Normal };
            if (state != lastState)
            {
                lastState = state;
                if (state != FormWindowState.Minimized) Post(state == FormWindowState.Maximized ? "maximized" : "restored");
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int left, top, right, bottom; }

    [StructLayout(LayoutKind.Sequential)]
    struct NCCALCSIZE_PARAMS
    {
        public RECT rgrc0, rgrc1, rgrc2;
        public IntPtr lppos;
    }

    void CreateShortcut(string instanceId)
    {
        var inst = Nelya.Core.Instances.Get(instanceId);
        if (inst == null) return;
        var name = Nelya.Core.Js.S(inst["name"]) ?? instanceId;
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var safe = string.Concat(name.Split(Path.GetInvalidFileNameChars()));
        var type = Type.GetTypeFromProgID("WScript.Shell");
        if (type == null) return;
        dynamic shell = Activator.CreateInstance(type)!;
        dynamic link = shell.CreateShortcut(Path.Combine(desktop, safe + ".lnk"));
        link.TargetPath = Environment.ProcessPath;
        link.Arguments = "--launch " + instanceId;
        link.WorkingDirectory = Path.GetDirectoryName(Environment.ProcessPath);
        link.IconLocation = Environment.ProcessPath + ",0";
        link.Description = "play " + name + " with nelya";
        link.Save();
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    static extern bool IsZoomed(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
