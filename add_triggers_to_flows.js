// node .\add_triggers_to_flows.js  "..\parenttext-deployment\parenttext-jamaica-repo\flows\jamaica-test-merging.json" "..\parenttext-deployment\parenttext-jamaica-repo\edits\triggers.json" "..\parenttext-deployment\parenttext-jamaica-repo\temp\triggers_in_wfr.json"

let fs = require('fs');
let uuid = require("uuid")
let path = require("path")

let input_args = process.argv.slice(2);
let input_path_tr = input_args[1];
let input_path_fl = input_args[0];

var json_string_tr = fs.readFileSync(input_path_tr).toString();
var obj_triggers_by_cat = JSON.parse(json_string_tr);

var json_string_fl = fs.readFileSync(input_path_fl).toString();
var original_flows = JSON.parse(json_string_fl);

const sg_flow_uuid = "572ec380-d38c-406d-b5fc-62c8b087023f";
const sg_flow_name = "JM - PLH*UR - Redirect to trigger";


// create strings for case in wft nodes
var triggers_eng = "";
var triggers_strings_by_cat = {};
var triggers_cat = "";

for (cat in obj_triggers_by_cat){
    obj_triggers_by_cat[cat].forEach(tr => {
        triggers_eng = triggers_eng + tr + ",";
        triggers_cat = triggers_cat + tr + ",";
    })
    triggers_cat = triggers_cat.slice(0, triggers_cat.length - 1);
    triggers_strings_by_cat[cat] = triggers_cat;
    triggers_cat = "";
}
triggers_eng = triggers_eng.slice(0, triggers_eng.length - 1);

// add keywords to all safeguarding nodes
original_flows.flows.forEach(flow => {
	//console.log(flow.name)
    let wfr_nodes = flow.nodes.filter(node => (node.hasOwnProperty('router') && node.router.operand == "@input.text" && node.router.hasOwnProperty("wait")))
    wfr_nodes.forEach(node => process_wfr_node(node, flow, triggers_eng));

    //process wfr nodes with no cases
    let wrf_nodes_no_cases = flow.nodes.filter(node => (node.hasOwnProperty('router') && node.router.operand == "@input" && node.router.hasOwnProperty("wait")))
    wrf_nodes_no_cases.forEach(node => process_wfr_node(node, flow, triggers_eng, true));
});




// add keywords to redirect to trigger flow
let redirect_flow = original_flows.flows.filter(fl => fl.name == sg_flow_name)
if (redirect_flow.length != 1){
    console.error("no redirect flow found");
}
redirect_flow = redirect_flow[0];

let split_node = redirect_flow.nodes[0];


split_node.router.cases.forEach(cs => {
    let corresp_cat = split_node.router.categories.filter(cat => cat.uuid == cs.category_uuid)[0];
    cs.arguments = [triggers_strings_by_cat[corresp_cat.name]]; 
})




let new_flows = JSON.stringify(original_flows, null, 2);
var output_path = input_args[2];
fs.writeFile(output_path, new_flows, function (err, result) {
    if (err) console.log('error', err);
});




////////////////////////////////////////////////////////

function process_wfr_node(node, flow, triggers_eng, no_cases = false) {

    // position of the wfr node
    if (flow.hasOwnProperty("_ui") && flow._ui.nodes.hasOwnProperty(node.uuid)){
        var node_position = flow._ui.nodes[node.uuid].position;
    } 


    // generate uuid for the 2 nodes to add
    let enter_flow_node_uuid = uuid.v4();
 
    //add category with safeguarding keywords to wfr node
    add_trigger_cat(node, enter_flow_node_uuid, triggers_eng);

    // generate enter_flow and split node
    let enter_flow_node = generate_enter_flow_node(enter_flow_node_uuid, sg_flow_name, sg_flow_uuid);

    // add nodes to flow
    flow.nodes.push(enter_flow_node)
 
    // position nodes far on the right in the _ui
    if (flow.hasOwnProperty("_ui")){
        flow._ui.nodes[enter_flow_node.uuid] = {
            position: {
                left: node_position.left + 2000,
                top: node_position.top
            },
            type: "split_by_subflow"
        }
    }
    
    if (no_cases){
        node.router.operand = "@input.text";
    }

}

function add_trigger_cat(wfr_node, dest_uuid, sg_keywords_eng) {
    //create case object
    var sg_case = {};
    sg_case["arguments"] = [sg_keywords_eng];
    sg_case["type"] = "has_any_word";
    sg_case["uuid"] = uuid.v4();
    sg_case["category_uuid"] = uuid.v4();

    wfr_node.router.cases.push(sg_case);


    //create corresponding category object
    var sg_cat = {};
    sg_cat["uuid"] = sg_case["category_uuid"];
    sg_cat["name"] = "Triggers";
    sg_cat["exit_uuid"] = uuid.v4();

    wfr_node.router.categories.push(sg_cat);

    var sg_exit = {};
    sg_exit["uuid"] = sg_cat.exit_uuid;
    sg_exit["destination_uuid"] = dest_uuid;

    wfr_node.exits.push(sg_exit);

    return sg_exit.destination_uuid

}

function generate_enter_flow_node(nodeId, flow_name, flow_uuid) {
    let dest_uuid = null
    let enter_flow_node = {
        uuid: nodeId,
        actions: [],
    };

    enter_flow_node.actions.push({
        flow: {
            name: flow_name,
            uuid: flow_uuid
        },
        type: "enter_flow",
        uuid: uuid.v4(),
    });

    let exits = [
        {
            uuid: uuid.v4(),
            destination_uuid: dest_uuid,
        },
        {
            uuid: uuid.v4(),
            destination_uuid: dest_uuid,
        },
    ];

    enter_flow_node.exits = exits;

    let node_categories = [
        {
            uuid: uuid.v4(),
            name: "Complete",
            exit_uuid: exits[0].uuid,
        },
        {
            uuid: uuid.v4(),
            name: "Expired",
            exit_uuid: exits[1].uuid,
        },
    ];
    let node_cases = [
        {
            uuid: uuid.v4(),
            type: "has_only_text",
            arguments: ["completed"],
            category_uuid: node_categories[0].uuid,
        },
        {
            uuid: uuid.v4(),
            type: "has_only_text",
            arguments: ["expired"],
            category_uuid: node_categories[1].uuid,
        },
    ];

    enter_flow_node.router = {
        cases: node_cases,
        categories: node_categories,
        operand: "@child.run.status",
        type: "switch",
        default_category_uuid: node_categories[1].uuid,
    };



    return enter_flow_node
}

