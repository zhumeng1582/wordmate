import AppKit
// Static artwork only: never include household data in a share-card screenshot.
let canvas = NSImage(size: NSSize(width: 1000, height: 800))
canvas.lockFocus()
NSColor(calibratedRed: 0.97, green: 0.98, blue: 0.95, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1000, height: 800)).fill()
NSColor(calibratedRed: 0.89, green: 0.94, blue: 0.87, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 65, y: 60, width: 870, height: 680), xRadius: 45, yRadius: 45).fill()
let green = NSColor(calibratedRed: 0.14, green: 0.36, blue: 0.28, alpha: 1)
func label(_ text: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ bold: Bool = false) {
 (text as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [.font: bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size), .foregroundColor: green])
}
label("单词共学", 110, 635, 34)
label("邀请你，一起陪孩子", 110, 520, 58, true)
label("每天一点，记得更牢", 110, 445, 38)
NSColor.white.setFill()
NSBezierPath(roundedRect: NSRect(x: 110, y: 165, width: 350, height: 210), xRadius: 24, yRadius: 24).fill()
NSBezierPath(roundedRect: NSRect(x: 475, y: 165, width: 350, height: 210), xRadius: 24, yRadius: 24).fill()
label("Aa", 210, 225, 80, true)
label("一起学", 550, 240, 48, true)
label("点击卡片 · 申请加入家庭", 110, 100, 30)
canvas.unlockFocus()
let bitmap = NSBitmapImageRep(data: canvas.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "apps/miniapp/src/assets/invite-cover.png"))
