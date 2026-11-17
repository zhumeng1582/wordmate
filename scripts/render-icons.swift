import AppKit
import WebKit
let input=CommandLine.arguments[1],output=CommandLine.arguments[2]
final class IconRenderer:NSObject,WKNavigationDelegate {
 let web=WKWebView(frame:NSRect(x:0,y:0,width:400,height:400))
 let window=NSWindow(contentRect:NSRect(x:0,y:0,width:400,height:400),styleMask:.borderless,backing:.buffered,defer:false)
 override init(){super.init();window.contentView=web;web.navigationDelegate=self}
 func start(){web.loadFileURL(URL(fileURLWithPath:input),allowingReadAccessTo:URL(fileURLWithPath:input).deletingLastPathComponent())}
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){poll()}
 func poll(){web.evaluateJavaScript("window.iconError ? 'ERROR:'+window.iconError : window.iconReady ? JSON.stringify(window.iconExports) : null"){value,error in
  if let text=value as? String {if text.hasPrefix("ERROR:"){print(text);exit(1)};do{try text.write(to:URL(fileURLWithPath:output),atomically:true,encoding:.utf8);print("Exported icon rasters");exit(0)}catch{print("WRITE_FAILED");exit(1)}}
  DispatchQueue.main.asyncAfter(deadline:.now()+0.1){self.poll()}
 }}
}
let app=NSApplication.shared;app.setActivationPolicy(.prohibited)
let renderer=IconRenderer();renderer.start()
DispatchQueue.main.asyncAfter(deadline:.now()+25){print("ICON_RENDER_TIMEOUT");exit(1)}
app.run()
