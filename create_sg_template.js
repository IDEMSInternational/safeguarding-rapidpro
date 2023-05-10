const fs = require('fs');


//let template = fs.readFileSync('./keywords/keywords_json/philippines/single_language/fil.json').toString();

let template = fs.readFileSync('./keywords/keywords_json/safeguarding_template_srh.json').toString();
template = JSON.parse(template);

for (let topic in template){
    
    template[topic].forEach(kw => {
        kw["Translation"] = {};
    });
    
}


template = JSON.stringify(template, null, 2);

let output_path = './keywords/keywords_json/safeguarding_srh.json';
fs.writeFile(output_path, template, function (err, result) {
    if (err) console.log('error', err);
});