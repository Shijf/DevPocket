import AppKit
import ImageIO
import CoreGraphics

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let output = root.appendingPathComponent("artifacts/store-screenshots")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let entries = [
 ("01-headers", "guide-headers", "请求调试，\n从一行开始。", "Edit requests.\nOne header at a time.", "独立开关 · 自动保存 · 逐行设置", "Per-rule switches · Autosave", "HEADERS"),
 ("02-proxy", "guide-proxy", "本地资源，\n接入页面现场。", "Your local build.\nOn the page you test.", "JS / CSS / 图片 / 字体 / 接口", "Redirect to an HTTP server", "RESOURCE REDIRECT"),
 ("03-json", "guide-json-compare", "左右对照，\n看清每处差异。", "Compare JSON.\nSee what changed.", "节点折叠 · 结构对比 · 保留大整数", "Fold nodes · Compare structures", "JSON COMPARE"),
 ("04-order", "guide-tool-order", "常用工具，\n按你的顺序。", "Your tools.\nYour preferred order.", "自由排序 · 前四位快捷入口", "Reorder all tools · Four shortcuts", "YOUR WORKSPACE"),
 ("05-tools", "guide-more-tools", "17 款工具，\n装进一个口袋。", "17 practical tools.\nOne browser popup.", "搜索即达 · 网络 / 数据 / 页面调试", "Search tools · Stay in your flow", "DEVELOPER TOOLBOX")
]
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> NSColor { NSColor(srgbRed:r, green:g, blue:b, alpha:1) }
func text(_ string:String, x:CGFloat, y:CGFloat, width:CGFloat, height:CGFloat, size:CGFloat, weight:NSFont.Weight, ink:NSColor) {
 let style = NSMutableParagraphStyle(); style.lineSpacing = 8
 (string as NSString).draw(in:NSRect(x:x,y:y,width:width,height:height),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:ink,.paragraphStyle:style])
}
for (filename,source,title,english,subtitle,caption,tag) in entries {
 guard let ctx = CGContext(data:nil,width:1280,height:800,bitsPerComponent:8,bytesPerRow:1280*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue) else { fatalError("RGB context unavailable") }
 NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(cgContext:ctx,flipped:false)
 color(1,0.976,0.953).setFill(); NSRect(x:0,y:0,width:1280,height:800).fill()
 color(1,0.92,0.83).setFill(); NSBezierPath(ovalIn:NSRect(x:1050,y:580,width:340,height:340)).fill()
 color(1,0.945,0.89).setFill(); NSBezierPath(ovalIn:NSRect(x:-100,y:-150,width:430,height:430)).fill()
 text("DevPocket",x:64,y:690,width:480,height:60,size:32,weight:.bold,ink:color(0.17,0.18,0.21))
 text(tag,x:66,y:637,width:475,height:40,size:13,weight:.semibold,ink:color(0.72,0.26,0.05))
 text(title,x:64,y:390,width:490,height:220,size:43,weight:.bold,ink:color(0.17,0.18,0.21))
 text(english,x:66,y:258,width:475,height:140,size:26,weight:.medium,ink:color(0.36,0.37,0.40))
 text(subtitle,x:66,y:188,width:480,height:50,size:19,weight:.medium,ink:color(0.65,0.23,0.02))
 text(caption,x:66,y:145,width:480,height:45,size:17,weight:.regular,ink:color(0.40,0.41,0.44))
 text("界面为中文 · Chinese interface",x:66,y:65,width:480,height:30,size:13,weight:.regular,ink:color(0.45,0.45,0.47))
 let input = root.appendingPathComponent("docs/screenshots/\(source).png")
 guard let imageSource = CGImageSourceCreateWithURL(input as CFURL,nil), let screenshot = CGImageSourceCreateImageAtIndex(imageSource,0,nil) else { fatalError("Missing \(source)") }
 let scale = min(638 / CGFloat(screenshot.width), 688 / CGFloat(screenshot.height))
 let w = CGFloat(screenshot.width)*scale, h=CGFloat(screenshot.height)*scale
 let rect=CGRect(x:600+(638-w)/2,y:(800-h)/2,width:w,height:h)
 ctx.saveGState();ctx.setShadow(offset:CGSize(width:0,height:-8),blur:28,color:color(0.35,0.20,0.10).withAlphaComponent(0.14).cgColor)
 ctx.setFillColor(NSColor.white.cgColor);ctx.addPath(CGPath(roundedRect:rect,cornerWidth:12,cornerHeight:12,transform:nil));ctx.fillPath();ctx.restoreGState()
 ctx.interpolationQuality = .high;ctx.draw(screenshot,in:rect)
 NSGraphicsContext.restoreGraphicsState()
 guard let result=ctx.makeImage(), let destination=CGImageDestinationCreateWithURL(output.appendingPathComponent(filename+".png") as CFURL,"public.png" as CFString,1,nil) else { fatalError("Cannot export") }
 CGImageDestinationAddImage(destination,result,nil)
 guard CGImageDestinationFinalize(destination) else { fatalError("Cannot save PNG") }
 print(filename+".png")
}
