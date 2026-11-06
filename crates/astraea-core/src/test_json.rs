//! Minimal JSON reader for test corpora (the core crate has no dependencies).

#[derive(Debug)]
pub(crate) enum Json {
    Null,
    Bool(#[allow(dead_code)] bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub(crate) fn get(&self, key: &str) -> &Json {
        match self {
            Json::Obj(pairs) => pairs
                .iter()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v)
                .unwrap_or(&Json::Null),
            _ => &Json::Null,
        }
    }
    pub(crate) fn num(&self) -> f64 {
        match self {
            Json::Num(v) => *v,
            _ => panic!("expected number, got {:?}", self),
        }
    }
    pub(crate) fn arr(&self) -> &Vec<Json> {
        match self {
            Json::Arr(v) => v,
            _ => panic!("expected array, got {:?}", self),
        }
    }
    pub(crate) fn obj(&self) -> &Vec<(String, Json)> {
        match self {
            Json::Obj(v) => v,
            _ => panic!("expected object, got {:?}", self),
        }
    }
}

pub(crate) struct CorpusParser {
    chars: Vec<char>,
    pos: usize,
}

impl CorpusParser {
    pub(crate) fn parse(text: &str) -> Json {
        let mut p = CorpusParser {
            chars: text.chars().collect(),
            pos: 0,
        };
        let v = p.value();
        p.ws();
        assert!(p.pos == p.chars.len(), "trailing JSON content");
        v
    }
    fn ws(&mut self) {
        while self.pos < self.chars.len() && self.chars[self.pos].is_whitespace() {
            self.pos += 1;
        }
    }
    fn peek(&self) -> char {
        self.chars[self.pos]
    }
    fn value(&mut self) -> Json {
        self.ws();
        match self.peek() {
            '{' => self.object(),
            '[' => self.array(),
            '"' => Json::Str(self.string()),
            't' => {
                self.lit("true");
                Json::Bool(true)
            }
            'f' => {
                self.lit("false");
                Json::Bool(false)
            }
            'n' => {
                self.lit("null");
                Json::Null
            }
            _ => Json::Num(self.number()),
        }
    }
    fn lit(&mut self, s: &str) {
        for c in s.chars() {
            assert_eq!(self.chars[self.pos], c);
            self.pos += 1;
        }
    }
    fn object(&mut self) -> Json {
        self.pos += 1; // {
        let mut pairs = Vec::new();
        self.ws();
        if self.peek() == '}' {
            self.pos += 1;
            return Json::Obj(pairs);
        }
        loop {
            self.ws();
            let k = self.string();
            self.ws();
            assert_eq!(self.chars[self.pos], ':');
            self.pos += 1;
            let v = self.value();
            pairs.push((k, v));
            self.ws();
            match self.chars[self.pos] {
                ',' => {
                    self.pos += 1;
                }
                '}' => {
                    self.pos += 1;
                    break;
                }
                c => panic!("unexpected object char {}", c),
            }
        }
        Json::Obj(pairs)
    }
    fn array(&mut self) -> Json {
        self.pos += 1; // [
        let mut items = Vec::new();
        self.ws();
        if self.peek() == ']' {
            self.pos += 1;
            return Json::Arr(items);
        }
        loop {
            items.push(self.value());
            self.ws();
            match self.chars[self.pos] {
                ',' => {
                    self.pos += 1;
                }
                ']' => {
                    self.pos += 1;
                    break;
                }
                c => panic!("unexpected array char {}", c),
            }
        }
        Json::Arr(items)
    }
    fn string(&mut self) -> String {
        assert_eq!(self.chars[self.pos], '"');
        self.pos += 1;
        let mut out = String::new();
        loop {
            let c = self.chars[self.pos];
            self.pos += 1;
            match c {
                '"' => break,
                '\\' => {
                    let e = self.chars[self.pos];
                    self.pos += 1;
                    match e {
                        '"' => out.push('"'),
                        '\\' => out.push('\\'),
                        '/' => out.push('/'),
                        'b' => out.push('\u{0008}'),
                        'f' => out.push('\u{000C}'),
                        'n' => out.push('\n'),
                        'r' => out.push('\r'),
                        't' => out.push('\t'),
                        'u' => {
                            let h: String =
                                self.chars[self.pos..self.pos + 4].iter().collect();
                            self.pos += 4;
                            let cp = u32::from_str_radix(&h, 16).expect("hex escape");
                            out.push(char::from_u32(cp).expect("scalar"));
                        }
                        _ => panic!("bad escape {}", e),
                    }
                }
                _ => out.push(c),
            }
        }
        out
    }
    fn number(&mut self) -> f64 {
        let start = self.pos;
        while self.pos < self.chars.len()
            && matches!(
                self.chars[self.pos],
                '-' | '+' | '0'..='9' | '.' | 'e' | 'E'
            )
        {
            self.pos += 1;
        }
        self.chars[start..self.pos]
            .iter()
            .collect::<String>()
            .parse()
            .expect("number")
    }
}
