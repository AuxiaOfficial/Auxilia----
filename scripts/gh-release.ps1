# 用凭据管理器里的 GitHub 凭据创建 Release 并上传安装包
# 只在本地使用，不打印任何 token
$ErrorActionPreference = 'Stop'
$repo = 'AuxiaOfficial/Auxilia----'
$tag = 'v0.1.0'
$asset = 'D:\project\auxilia\src-tauri\target\release\bundle\nsis\Auxilia_0.1.0_x64-setup.exe'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CredApi2 {
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredReadW(string target, int type, int flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern void CredFree(IntPtr buffer);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  public static string ReadBlob(string target) {
    IntPtr p;
    if (!CredReadW(target, 1, 0, out p)) return null;
    var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    string result = null;
    if (c.CredentialBlobSize > 0) {
      byte[] buf = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, buf, 0, c.CredentialBlobSize);
      result = System.Text.Encoding.UTF8.GetString(buf);
    }
    CredFree(p);
    return result;
  }
}
"@

$blob = [CredApi2]::ReadBlob('git:https://github.com')
if (-not $blob) { throw 'NO_CREDENTIAL' }

# 尝试几种形态：纯 token / user:pass / json
$candidates = @()
$candidates += $blob
if ($blob -match '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})') { $candidates += $Matches[1] }
try { $j = $blob | ConvertFrom-Json; if ($j.accessToken) { $candidates += $j.accessToken } } catch { }

$ok = $null
foreach ($cand in $candidates) {
  try {
    $r = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers @{
      Authorization = "Bearer $cand"; 'User-Agent' = 'auxilia'; Accept = 'application/vnd.github+json'
    } -TimeoutSec 20
    if ($r.login) { $ok = $cand; Write-Output ('AUTH_OK as ' + $r.login); break }
  } catch { }
}
if (-not $ok) { Write-Output 'AUTH_FAILED'; exit 3 }

$headers = @{
  Authorization = "Bearer $ok"; 'User-Agent' = 'auxilia'; Accept = 'application/vnd.github+json'
}

# 已存在就复用
$existing = $null
try {
  $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers $headers -TimeoutSec 20
} catch { }

if ($existing) {
  Write-Output ('RELEASE_EXISTS id=' + $existing.id)
  $release = $existing
} else {
  $body = @{
    tag_name = $tag
    target_commitish = 'main'
    name = 'Auxilia 0.1.0'
    body = @"
Auxilia 0.1.0 —— Windows 桌面专注计时器。

## 安装
下载 `Auxilia_0.1.0_x64-setup.exe`，双击安装（currentUser，无需管理员权限）。
首次启动会走三步引导：定快捷键 → 建第一个任务。

## 这一版有什么
- 任务池 / TaskLine 看板（拖拽生成时长块、可拉伸、自动避让）
- 倒计时 / 正计时 / 定时提醒三种任务；多任务并行、暂停、崩溃恢复
- 结束三问复盘（可配置问题数量，可跳过照常结算）
- 双币经济：coin 买装置、心流币买装饰；反思按手打字数额外发币
- 20 枚徽章、热力图、任务占比、可拖拽装饰墙
- 全局快捷键、托盘、贴顶迷你浮条、浮窗
"@
    draft = $false
    prerelease = $false
  } | ConvertTo-Json -Depth 5

  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" -Method Post -Headers $headers `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 60
  Write-Output ('RELEASE_CREATED ' + $release.html_url)
}

# 上传安装包（已存在同名资产则跳过）
$uploadUrl = ($release.upload_url -replace '\{\?name,label\}', '') + '?name=Auxilia_0.1.0_x64-setup.exe'
$already = $false
foreach ($a in $release.assets) { if ($a.name -eq 'Auxilia_0.1.0_x64-setup.exe') { $already = $true } }
if ($already) {
  Write-Output 'ASSET_EXISTS'
} else {
  $bytes = [IO.File]::ReadAllBytes($asset)
  $up = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers `
    -ContentType 'application/octet-stream' -Body $bytes -TimeoutSec 300
  Write-Output ('ASSET_UPLOADED ' + $up.browser_download_url)
}
Write-Output ('DONE ' + $release.html_url)
