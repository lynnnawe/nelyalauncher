using System.Reflection;
using System.Runtime.InteropServices;
using System.Web;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Nelya;

sealed class LoginForm : Form
{
    readonly CoreWebView2Environment environment;
    readonly WebView2 view;
    readonly TaskCompletionSource<string?> result = new();

    LoginForm(CoreWebView2Environment environment)
    {
        this.environment = environment;
        Text = "sign in with microsoft";
        BackColor = Color.FromArgb(9, 8, 13);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(500, 640);
        using (var ico = Assembly.GetExecutingAssembly().GetManifestResourceStream("nelya.ico"))
            if (ico != null) Icon = new Icon(ico);
        view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(9, 8, 13) };
        Controls.Add(view);
        FormClosed += (_, _) => result.TrySetResult(null);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int dark = 1;
        DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
        int caption = 0x000D0809;
        DwmSetWindowAttribute(Handle, 35, ref caption, sizeof(int));
        int text = 0x00F2EBEC;
        DwmSetWindowAttribute(Handle, 36, ref text, sizeof(int));
        int border = 0x002A2027;
        DwmSetWindowAttribute(Handle, 34, ref border, sizeof(int));
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        try
        {
            var options = environment.CreateCoreWebView2ControllerOptions();
            options.IsInPrivateModeEnabled = true;
            await view.EnsureCoreWebView2Async(environment, options);
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.NavigationStarting += (_, a) =>
            {
                if (!a.Uri.StartsWith(Core.Accounts.Redirect, StringComparison.OrdinalIgnoreCase)) return;
                a.Cancel = true;
                var query = HttpUtility.ParseQueryString(new Uri(a.Uri).Query);
                result.TrySetResult(query["code"]);
                BeginInvoke(Close);
            };
            view.CoreWebView2.NewWindowRequested += (_, a) =>
            {
                a.Handled = true;
                view.CoreWebView2.Navigate(a.Uri);
            };
            view.CoreWebView2.Navigate("https://login.live.com/oauth20_authorize.srf"
                + "?client_id=" + Core.Accounts.ClientId
                + "&response_type=code"
                + "&scope=" + Uri.EscapeDataString("service::user.auth.xboxlive.com::MBI_SSL")
                + "&redirect_uri=" + Uri.EscapeDataString(Core.Accounts.Redirect)
                + "&prompt=select_account");
        }
        catch
        {
            result.TrySetResult(null);
            Close();
        }
    }

    public static Task<string?> GetCodeAsync(Form owner, CoreWebView2Environment environment)
    {
        var form = new LoginForm(environment) { StartPosition = FormStartPosition.Manual };
        var b = owner.Bounds;
        form.Location = new Point(b.Left + (b.Width - form.Width) / 2, b.Top + (b.Height - form.Height) / 2);
        form.Show(owner);
        return form.result.Task;
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
}
