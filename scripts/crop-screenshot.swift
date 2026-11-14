import Foundation
import ImageIO
import CoreGraphics

let args = CommandLine.arguments
guard args.count == 7,
      let x = Double(args[3]), let y = Double(args[4]),
      let width = Double(args[5]), let height = Double(args[6]),
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
      let cropped = image.cropping(to: CGRect(x: x, y: y, width: width, height: height)),
      let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, "public.png" as CFString, 1, nil)
else { fatalError("Usage: crop-screenshot input output x y width height") }
CGImageDestinationAddImage(destination, cropped, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Cannot write screenshot") }
