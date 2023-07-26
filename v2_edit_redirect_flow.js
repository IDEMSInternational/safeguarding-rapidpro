
let fs = require('fs');
let uuid = require("uuid")
let path = require("path")



let input_args = process.argv.slice(3);

let input_path_fl = input_args[0];
let input_path_kw = input_args[1];
var output_path = input_args[2];
let flow_names_to_filter = input_args[3]

var json_string_kw = fs.readFileSync(input_path_kw).toString();
var obj_keywords_by_cat = JSON.parse(json_string_kw);

var json_string_fl = fs.readFileSync(input_path_fl).toString();
var flows = JSON.parse(json_string_fl);



let log_file = "";

// create strings for case in wft nodes
var sg_keywords_eng = "";
var sg_keywords_transl = {};
var sg_keywords_by_cat_eng = {};
var sg_keywords_by_cat_transl = {};

for (let cat in obj_keywords_by_cat) {
    sg_keywords_cat_eng = "";
    sg_keywords_cat_transl = {};

    obj_keywords_by_cat[cat].forEach(eng_transl_pair =>{
    
        eng_transl_pair["English"]["keywords"].forEach(wd => {
            sg_keywords_eng = sg_keywords_eng + wd + ",";
            sg_keywords_cat_eng = sg_keywords_cat_eng + wd + ",";
        })
        eng_transl_pair["English"]["mispellings"].forEach(wd => {
            sg_keywords_eng = sg_keywords_eng + wd + ",";
            sg_keywords_cat_eng = sg_keywords_cat_eng + wd + ",";
        })
        if (eng_transl_pair.hasOwnProperty("Translation")){
            for (let lang in eng_transl_pair["Translation"]){
                if (!sg_keywords_transl.hasOwnProperty(lang)){
                    sg_keywords_transl[lang] = "";
                }
                if (!sg_keywords_cat_transl.hasOwnProperty(lang)){
                    sg_keywords_cat_transl[lang] = "";
                }
                eng_transl_pair["Translation"][lang]["keywords"].forEach(wd => {
                    sg_keywords_transl[lang] = sg_keywords_transl[lang] + wd + ",";
                    sg_keywords_cat_transl[lang] = sg_keywords_cat_transl[lang] + wd + ",";
                })
                eng_transl_pair["Translation"][lang]["mispellings"].forEach(wd => {
                    sg_keywords_transl[lang] = sg_keywords_transl[lang] + wd + ",";
                    sg_keywords_cat_transl[lang] = sg_keywords_cat_transl[lang] + wd + ",";
                })

            }
            
        }


    })
    sg_keywords_cat_eng = sg_keywords_cat_eng.slice(0, sg_keywords_cat_eng.length - 1);
    for (lang in sg_keywords_cat_transl){
        sg_keywords_cat_transl[lang] = sg_keywords_cat_transl[lang].slice(0, sg_keywords_cat_transl[lang].length - 1);
    }
    
    sg_keywords_by_cat_eng[cat] =  sg_keywords_cat_eng;
    sg_keywords_by_cat_transl[cat] =  sg_keywords_cat_transl;
    
}
sg_keywords_eng = sg_keywords_eng.slice(0, sg_keywords_eng.length - 1);

for (lang in sg_keywords_transl){
    sg_keywords_transl[lang] = sg_keywords_transl[lang].slice(0, sg_keywords_transl[lang].length - 1);
}


// Filter flows based on the list of flow names
let redirect_flows = flows.flows.filter(fl => flow_names_to_filter.includes(fl.name));

// Check if at least one redirect flow is found for processing
if (redirect_flows.length === 0) {
    console.error("No redirect flows found");
} else {
    // Process each redirect flow
    redirect_flows.forEach(redirect_flow => {
        processRedirectFlow(redirect_flow);
    });
}

let new_flows = JSON.stringify(flows, null, 2);


fs.writeFile(output_path, new_flows, function (err, result) {
    if (err) console.log('error', err);
});

let log_file_path = path.join(path.dirname(output_path),"warnings_safeguarding.txt");
fs.writeFile(log_file_path, log_file, function (err, result) {
    if (err) console.log('error', err);
});



////////////////////////////////////////////////////////

function processRedirectFlow(redirect_flow) {
    let split_node = redirect_flow.nodes[0];

    split_node.router.cases.forEach(cs => {
        let corresp_cat = split_node.router.categories.find(cat => cat.uuid === cs.category_uuid);
        let topic = corresp_cat.name;
        
        add_safeguarding_localization(redirect_flow, cs, topic);
    });
}

function add_safeguarding_localization(flow,cs,topic){
    cs.arguments = [sg_keywords_by_cat_eng[topic]];

    for (let lang_code in sg_keywords_by_cat_transl[topic]){
        if (!flow.hasOwnProperty("localization")){
            flow.localization = {};
        }
        if (!flow.localization.hasOwnProperty(lang_code)){
            flow.localization.hasOwnProperty(lang_code) = {};
        }
        let loc_obj = {};
        loc_obj.arguments = [sg_keywords_by_cat_transl[topic][lang_code]];
        flow.localization[lang_code][cs.uuid] = loc_obj 
    }
}

////////////////////////////////////////////////////////////////////////////////////////

