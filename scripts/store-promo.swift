import AppKit
import ImageIO
import CoreGraphics

let root = URL(fileURLWithPath:FileManager.default.currentDirectoryPath)
let output = root.appendingPathComponent("artifacts/store-promo")
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
func color(_ r:CGFloat,_ g:CGFloat,_ b:CGFloat)->NSColor{NSColor(srgbRed:r,green:g,blue:b,alpha:1)}
let ink=color(0.16,0.17,0.20), muted=color(0.42,0.40,0.39), orange=color(0.96,0.30,0.015)
func text(_ value:String,_ rect:NSRect,_ size:CGFloat,_ weight:NSFont.Weight,_ foreground:NSColor){
 let style=NSMutableParagraphStyle();style.lineSpacing=5
 (value as NSString).draw(in:rect,withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:foreground,.paragraphStyle:style])
}
func rounded(_ rect:NSRect,_ radius:CGFloat,_ fill:NSColor){fill.setFill();NSBezierPath(roundedRect:rect,xRadius:radius,yRadius:radius).fill()}
func star(_ x:CGFloat,_ y:CGFloat,_ size:CGFloat){
 let path=NSBezierPath();path.move(to:NSPoint(x:x,y:y+size));path.line(to:NSPoint(x:x+size*0.25,y:y+size*0.25));path.line(to:NSPoint(x:x+size,y:y));path.line(to:NSPoint(x:x+size*0.25,y:y-size*0.25));path.line(to:NSPoint(x:x,y:y-size));path.line(to:NSPoint(x:x-size*0.25,y:y-size*0.25));path.line(to:NSPoint(x:x-size,y:y));path.line(to:NSPoint(x:x-size*0.25,y:y+size*0.25));path.close();orange.withAlphaComponent(0.6).setStroke();path.lineWidth=1.4;path.stroke()
}
for (filename,w,h) in [("small-440x280",440,280),("marquee-1400x560",1400,560)] {
 let ctx=CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
 color(1,0.978,0.956).setFill();NSRect(x:0,y:0,width:w,height:h).fill()
 if w == 440 {
  color(1,0.92,0.82).setFill();NSBezierPath(ovalIn:NSRect(x:310,y:130,width:220,height:220)).fill()
  color(1,0.95,0.89).setFill();NSBezierPath(ovalIn:NSRect(x:-65,y:-100,width:230,height:230)).fill()
  if let icon=NSImage(contentsOf:root.appendingPathComponent("public/icons/icon-128.png")){icon.draw(in:NSRect(x:28,y:201,width:48,height:48))}
  text("DevPocket",NSRect(x:88,y:202,width:320,height:48),31,.bold,ink)
  text("把前端调试装进口袋",NSRect(x:28,y:139,width:390,height:42),25,.bold,ink)
  text("Frontend debugging, in your pocket.",NSRect(x:29,y:107,width:390,height:28),14,.medium,muted)
  rounded(NSRect(x:28,y:34,width:384,height:49),12,NSColor.white)
  text("17 款工具",NSRect(x:43,y:44,width:112,height:27),17,.semibold,color(0.70,0.23,0.015))
  text("Header · Mock · JSON",NSRect(x:159,y:45,width:245,height:25),15,.medium,muted)
  star(398,200,9)
 } else {
  color(1,0.92,0.82).setFill();NSBezierPath(ovalIn:NSRect(x:1060,y:250,width:470,height:470)).fill()
  color(1,0.95,0.89).setFill();NSBezierPath(ovalIn:NSRect(x:-110,y:-210,width:470,height:470)).fill()
  if let icon=NSImage(contentsOf:root.appendingPathComponent("public/icons/icon-128.png")){icon.draw(in:NSRect(x:64,y:421,width:64,height:64))}
  text("DevPocket",NSRect(x:145,y:425,width:530,height:60),42,.bold,ink)
  text("把前端调试\n装进口袋。",NSRect(x:64,y:203,width:620,height:185),62,.bold,ink)
  text("Frontend debugging, in your pocket.",NSRect(x:68,y:145,width:610,height:46),25,.medium,muted)
  text("17 款工具   /   一个浏览器入口",NSRect(x:68,y:79,width:580,height:38),23,.semibold,color(0.70,0.23,0.015))
  let labels=[("Header","请求头"),("Mock","接口模拟"),("JSON","节点对比"),("Proxy","资源代理"),("Diff","文本对比"),("Page","页面调试")]
  for (i,item) in labels.enumerated(){
   let x=CGFloat(770+(i%3)*184), y=CGFloat(286-(i/3)*151)
   ctx.saveGState();ctx.setShadow(offset:CGSize(width:0,height:-6),blur:20,color:color(0.35,0.2,0.1).withAlphaComponent(0.07).cgColor)
   rounded(NSRect(x:x,y:y,width:162,height:126),16,NSColor.white);ctx.restoreGState()
   text(item.0,NSRect(x:x+20,y:y+59,width:136,height:43),27,.bold,color(0.77,0.26,0.025))
   text(item.1,NSRect(x:x+20,y:y+19,width:136,height:33),18,.medium,muted)
  }
  text("网络调试   ·   数据检查   ·   页面验证",NSRect(x:770,y:80,width:565,height:38),21,.medium,muted)
  star(730,430,12);star(1318,459,18);star(1352,112,10)
 }
 NSGraphicsContext.restoreGraphicsState()
 let destination=CGImageDestinationCreateWithURL(output.appendingPathComponent(filename+".png") as CFURL,"public.png" as CFString,1,nil)!
 CGImageDestinationAddImage(destination,ctx.makeImage()!,nil)
 guard CGImageDestinationFinalize(destination) else{fatalError("Export failed")}
 print(filename+".png")
}
