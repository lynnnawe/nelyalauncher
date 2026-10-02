using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NelyaSetup
{
    sealed class SetupForm : Form
    {
        const string Origin = "https://setup.nelya/";

        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        readonly bool uninstall;
        readonly WebView2 view;
        bool working;
        bool finished;

        public SetupForm(bool uninstall)
        {
            this.uninstall = uninstall;
            Text = uninstall ? "uninstall nelya" : "nelya setup";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.Dpi;
            AutoScaleDimensions = new SizeF(96F, 96F);
            ClientSize = new Size(660, 440);
            BackColor = Color.FromArgb(12, 11, 16);
            using (var ico = Assembly.GetExecutingAssembly().GetManifestResourceStream("nelya.ico"))
                if (ico != null) Icon = new Icon(ico);
            view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(12, 11, 16) };
            Controls.Add(view);
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ClassStyle |= 0x20000;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            var round = 2;
            DwmSetWindowAttribute(Handle, 33, ref round, 4);
            var dark = 1;
            DwmSetWindowAttribute(Handle, 20, ref dark, 4);
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            try
            {
                var temp = Path.Combine(Path.GetTempPath(), "nelya-setup");
                Directory.CreateDirectory(temp);
                var loader = Path.Combine(temp, "WebView2Loader.dll");
                if (!File.Exists(loader))
                {
                    using (var src = Assembly.GetExecutingAssembly().GetManifestResourceStream("lib/WebView2Loader.dll"))
                    using (var dst = File.Create(loader))
                        src.CopyTo(dst);
                }
                CoreWebView2Environment.SetLoaderDllFolderPath(temp);
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(temp, "webview"));
                await view.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                MessageBox.Show("the installer needs the Microsoft Edge WebView2 runtime, which comes with windows 10 and 11.\n\n" + ex.Message, "nelya setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }
            var core = view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.AddWebResourceRequestedFilter(Origin + "*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (s, a) => Serve(core, a);
            core.WebMessageReceived += OnMessage;
            var dir = Engine.InstalledDir();
            var query = "mode=" + (uninstall ? "uninstall" : "install")
                + "&version=" + Uri.EscapeDataString(Engine.Version)
                + "&installed=" + Uri.EscapeDataString(Engine.InstalledVersion() ?? "")
                + "&dir=" + Uri.EscapeDataString(dir ?? Engine.DefaultDir);
            core.Navigate(Origin + "index.html?" + query);
        }

        void Serve(CoreWebView2 core, CoreWebView2WebResourceRequestedEventArgs a)
        {
            var path = new Uri(a.Request.Uri).AbsolutePath.TrimStart('/');
            var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("web/" + path);
            if (stream == null)
            {
                a.Response = core.Environment.CreateWebResourceResponse(null, 404, "not found", "");
                return;
            }
            var ext = Path.GetExtension(path).ToLowerInvariant();
            var type = ext == ".html" ? "text/html; charset=utf-8" : ext == ".css" ? "text/css; charset=utf-8" : ext == ".js" ? "text/javascript; charset=utf-8" : ext == ".png" ? "image/png" : "application/octet-stream";
            a.Response = core.Environment.CreateWebResourceResponse(stream, 200, "OK", "Content-Type: " + type + "\r\nCache-Control: no-store");
        }

        void Send(string type, string text = null, double pct = -1)
        {
            if (IsDisposed) return;
            var json = new StringBuilder("{\"type\":").Append(Quote(type));
            if (text != null) json.Append(",\"text\":").Append(Quote(text));
            if (pct >= 0) json.Append(",\"pct\":").Append(pct.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));
            json.Append('}');
            var message = json.ToString();
            Action post = () =>
            {
                if (!IsDisposed && view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(message);
            };
            if (InvokeRequired) BeginInvoke(post);
            else post();
        }

        static string Quote(string s)
        {
            var b = new StringBuilder("\"");
            foreach (var c in s)
            {
                if (c == '"' || c == '\\') b.Append('\\').Append(c);
                else if (c < 32) b.Append("\\u").Append(((int)c).ToString("x4"));
                else b.Append(c);
            }
            return b.Append('"').ToString();
        }

        void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw;
            try { raw = e.TryGetWebMessageAsString(); } catch { return; }
            var parts = raw.Split('|');
            switch (parts[0])
            {
                case "drag":
                    ReleaseCapture();
                    SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero);
                    break;
                case "minimize":
                    WindowState = FormWindowState.Minimized;
                    break;
                case "close":
                    if (!working) Close();
                    break;
                case "browse":
                    Browse(parts.Length > 1 ? parts[1] : Engine.DefaultDir);
                    break;
                case "install":
                    if (!working && parts.Length >= 5) _ = Install(parts[1], parts[2] == "1", parts[3] == "1", parts[4] == "1");
                    break;
                case "uninstall":
                    if (!working) _ = Uninstall(parts.Length > 1 && parts[1] == "1");
                    break;
                case "open":
                    Engine.Launch(Engine.InstalledDir() ?? Engine.DefaultDir);
                    Close();
                    break;
            }
        }

        void Browse(string current)
        {
            using (var dlg = new FolderBrowserDialog { Description = "where should nelya live?", ShowNewFolderButton = true })
            {
                try { dlg.SelectedPath = Directory.Exists(current) ? current : Path.GetDirectoryName(current); } catch { }
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                var picked = dlg.SelectedPath;
                if (!Path.GetFileName(picked.TrimEnd('\\')).Equals("nelya", StringComparison.OrdinalIgnoreCase)) picked = Path.Combine(picked, "nelya");
                Send("dir", picked);
            }
        }

        async Task Install(string dir, bool desktop, bool startMenu, bool launch)
        {
            working = true;
            Action<string, double> report = (t, p) => Send("progress", t, p);
            try
            {
                dir = Path.GetFullPath(dir.Trim());
                report("checking for the .net 9 runtime", 0.03);
                if (!Engine.HasRuntime()) await Engine.InstallRuntime(report);
                report("closing nelya if it is open", 0.6);
                await Task.Run(() => Engine.CloseRunning(dir));
                report("copying nelya to " + dir, 0.7);
                await Task.Run(() => Engine.WritePayload(dir));
                report("making shortcuts", 0.84);
                await Task.Run(() => Engine.Shortcuts(dir, desktop, startMenu));
                report("registering with windows", 0.93);
                await Task.Run(() => Engine.Register(dir));
                report("done", 1);
                finished = true;
                Send("done");
                if (launch)
                {
                    await Task.Delay(900);
                    Engine.Launch(dir);
                    await Task.Delay(600);
                    Close();
                }
            }
            catch (Exception ex)
            {
                Send("error", ex.Message);
            }
            finally
            {
                working = false;
            }
        }

        async Task Uninstall(bool wipe)
        {
            working = true;
            try
            {
                var dir = Engine.InstalledDir() ?? Engine.DefaultDir;
                await Task.Run(() => Engine.Uninstall(dir, wipe, (t, p) => Send("progress", t, p)));
                Send("progress", "done", 1);
                finished = true;
                Send("done");
            }
            catch (Exception ex)
            {
                Send("error", ex.Message);
            }
            finally
            {
                working = false;
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (working && !finished) e.Cancel = true;
            base.OnFormClosing(e);
        }
    }
}
