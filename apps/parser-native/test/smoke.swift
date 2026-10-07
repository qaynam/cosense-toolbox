// xcframework を Swift から読めて、リンクできるかを確かめる (CI で iOS 向けにビルドするだけで、動かしはしない)
import CosenseParser

let parser = cosense_parser_new()
let text = "[* 太字] と [リンク]"
if let json = cosense_parse_line(parser, text, text.utf8.count) {
  print(String(cString: json))
  cosense_string_free(json)
}
cosense_parser_free(parser)
