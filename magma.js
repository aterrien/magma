var fs = require('fs');
var PEG = require("pegjs");
var php = null;

console.log("read parser");

var readFiles = function(files, cb) {
  var counter = files.length;
  var result = { files: {}, errors: []};
  if (!files || files.length == 0) {
    cb(result);
  } else {
    files.forEach(function (file){
      fs.readFile(file, 'utf8', function(err,data) {
        if (err) {
          result.errors.push(err);
        } else {
          result.files[file] = data;
        }
        counter --;
        if (counter == 0) cb(result);
      });
    });
  }
};

var builder = {
  output: function(item) {
    return 'console.log(' + JSON.stringify(item.data) + ');';
  }
  ,php: function(item) {
    return jsBuild(item.data);
  }
  ,php_function: function(item) {
    return 'function ' + item.name + '() {\n' 
      + jsBuild(item.body)
      + '\n}'
    ;
  }
  ,php_variable: function(item) {
    return item.name + ' = null;';
  }
  ,php_if: function(item) {
    return 'if (' + jsBuild(item.condition) + ')' + jsBuild(item.statement) + jsBuild(item._elseif) + jsBuild(item._else); 
  }
  ,php_statements: function(item) {
    return '{\n' + jsBuild(item.data) + '\n}\n';
  }
  ,php_else: function(item) {
    return ' else ' + jsBuild(item.statement);
  }
  ,php_elseif: function(item) {
    return ' elseif(' + jsBuild(item.condition) + ')' + jsBuild(item.statement);
  }
};

var jsBuild = function(nodes) {
  if (!nodes) return '';
  if (nodes.type) {
    return builder[nodes.type](nodes) + "\n";
  } else {
    var result = [];
    for(var i = 0; i < nodes.length; i++) {
      if (nodes[i].type) {
        result.push(builder[nodes[i].type](nodes[i]));
      }
    }
    return result.join("\n");
  }
};


fs.readFile('src/grammar/php.pegjs', 'utf8', function(err, data) {
  if (err) {
    return console.error(err);
  }

  console.log("build parser");

  var importRegex = /^@import\s+'([A-Za-z0-9\-_.]*)'$/mg;
  var files = [];
  match = importRegex.exec(data);
  while (match != null) {
    files.push(match[1]);
    match = importRegex.exec(data);
  }
  if (files && files.length > 0) {
    for(var i = 0; i < files.length; i++) {
      files[i] = 'src/grammar/' + files[i];
    }
  } else {
    files = [];
  }
  readFiles(files, function(imports) {
    try {
      data = data.replace(
        importRegex,
        function(match, file) {
          return imports.files['src/grammar/' + file];
        }
      );
      php = PEG.buildParser(data);
      
      var cache = fs.createWriteStream('src/php.js');
      cache.write(
        PEG.buildParser(data, {
          cache:    false,
          output:   "source",
          optimize: "speed",
          plugins:  []
        })
      );
      cache.end();
      console.log("read " + process.argv[2]);
      php_include(process.argv[2]);
    } catch(e) {
      show_error(e, data);
    }
  });
});

var show_error = function(e, file) {
  if(e.line) {
    console.error(
      "\n! Parse Error : " + e.message + "\n"
      + "At line " + e.line + ', ' + e.column
    );
    if ( file ) {
      console.log("\nSource Code :\n");
      var line = e.line - 2;
      if (line < 0) line = 0;
      var pstart = 0;
      var pnext = 0;
      for(var i = 0; i < line; i++) {
        pnext = file.indexOf("\n", pstart);
        if ( pnext < 0 ) {
          pstart = 0;
          break;
        }
        pstart = pnext + 1; 
      }
      var pend = pstart;
      for(var i = 0; i < 5; i++) {
        pnext = file.indexOf("\n", pend);
        if ( pnext < 0 ) {
          pnext = file.length;
          break;
        }
        var curLine = line + i;
        var loc = file.substring(pnext, pend)
        if (curLine ==  e.line ) {
          loc = '>> ' + loc;
        }
        if (loc.length > 74) {
          loc = loc.substring(0, 71) + '...';
        }
        console.log( curLine + '. ' + loc );
        pend = pnext + 1;
      }
    }
  } else {
    console.log(e);
    console.error(e);
  }
};

var php_include = function(filename) {
  fs.readFile(filename, 'utf8', function (err,data) {
    if (err) {
      return console.log(err);
    }
    console.log("parse file");
    try {
      var results = [];
      var buffer = '';
      for(var i = 0; i < data.length; i++) {
        c = data[i];
        if ( c == '<') {
          if (data[i+1] == '?') {
            if (buffer) {
              results.push({ type: 'output', data: buffer});
            }
            var offset = 2;
            if (data[i+2] == '=') {
              offset ++;
            } else if(data.substring(i + 2, i + 5).toLowerCase() == 'php') {
              offset += 3;
            }
            var next = data.indexOf("?>", i);
            results.push(
              { 
                type: 'php'
                , data: php.parse(
                  data.substring(
                    i + offset, next > i ? 
                      next:  data.length
                  )
                )
              }
            );
            if ( next > i ) {
              i = next + 2;
              buffer = '';
              continue;
            } else break;
          }
        }
        buffer += c;
      }
      console.log(JSON.stringify(results));
      console.log(jsBuild(results));
    } catch(e) {
      console.error(
        e.message + "\n"
        + "At line " + e.line + ', ' + e.column 
      );
    }
  });
};