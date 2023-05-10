const fs = require('fs');
const path = require('path');

let input_args = process.argv.slice(2);
let deployment = input_args[0];



let template = fs.readFileSync('./keywords/keywords_json/safeguarding_template_drug.json').toString();
var mult_lang = JSON.parse(template);

var files = fs.readdirSync('./keywords/keywords_json/' + deployment +'/single_language', { withFileTypes: true });

files = files
    .filter(dirent => dirent.isFile())
    .map(dirent => dirent.name);

const equals = (a, b) =>
  a.length === b.length &&
  a.every((v, i) => v === b[i]);



files.forEach( file =>{
    let lang_file = fs.readFileSync('./keywords/keywords_json/' + deployment +'/single_language/'+ file).toString();
    lang_file = JSON.parse(lang_file);
   
    let lang_code = path.parse(file).name;

    for (let topic in mult_lang){
        
        for (let i=0; i<mult_lang[topic].length; i++){
            let kw_obj = mult_lang[topic][i];
            if (!equals(kw_obj["English"]["keywords"],lang_file[topic][i]["English"]["keywords"])
                | !equals(kw_obj["English"]["mispellings"],lang_file[topic][i]["English"]["mispellings"])){
                console.error(lang_code + " error not same keyword group " + kw_obj["English"]["keywords"] + " "+ lang_file[topic][i]["English"]["keywords"])
            }
            kw_obj["Translation"][lang_code] = lang_file[topic][i]["Translation"];
        }       
    }
    

})


mult_lang = JSON.stringify(mult_lang, null, 2);

let output_path = './keywords/keywords_json/' + deployment + "/" + deployment + "_safeguarding_drug.json";
fs.writeFile(output_path, mult_lang, function (err, result) {
    if (err) console.log('error', err);
});
