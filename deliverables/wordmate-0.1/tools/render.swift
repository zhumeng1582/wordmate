import AppKit
for path in CommandLine.arguments.dropFirst() {
 guard let source = NSImage(contentsOfFile:path) else { print("cannot load \(path)"); continue }
 let size=source.size
 guard let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:Int(size.width),pixelsHigh:Int(size.height),bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0) else { continue }
 NSGraphicsContext.saveGraphicsState()
 NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
 source.draw(in:NSRect(origin:.zero,size:size))
 NSGraphicsContext.restoreGraphicsState()
 let dest=(path as NSString).deletingPathExtension+".png"
 try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:dest))
 print(dest)
}
