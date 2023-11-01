const fs = require('fs');
const uuid = require("uuid");
const path = require("path");

const [
    flowsPath,
    keywordsPath,
    outputPath,
    safeguardingFlowId,
    safeguardingFlowName
] = process.argv.slice(2);
const keywordsByCategory = JSON.parse(
    fs.readFileSync(keywordsPath).toString()
);
let rapidpro = JSON.parse(fs.readFileSync(flowsPath).toString());
let logs = [];

// create strings for case in wfr nodes
const keywordsEng = Object
    .values(keywordsByCategory)
    .flatMap(cat =>
        cat.flatMap(({ English: { keywords, mispellings } }) =>
            keywords.concat(mispellings)));

const keywordsByLanguage = Object
    .values(keywordsByCategory)
    .flatMap(pairs =>
        pairs.flatMap(({ Translation: tr }) =>
            Object.entries(tr).map(([lang, { keywords, mispellings }]) =>
                [lang, keywords.concat(mispellings)])))
    .reduce((obj, [lang, words]) => {
          obj[lang] = (obj[lang] || []).concat(words);
          return obj;
      }, {});

// add keywords to all safeguarding nodes
rapidpro.flows.forEach(flow => {
    flow.nodes
        .filter(isWaitForResponse)
        .forEach(node =>
            addSafeguarding(node, flow, keywordsEng, keywordsByLanguage));
    flow.nodes
        .filter(isNoCaseWaitForResponse)
        .forEach(node =>
            addSafeguarding(node, flow, keywordsEng, keywordsByLanguage, true));
});

fs.writeFile(outputPath, JSON.stringify(rapidpro, null, 2), logError);
fs.writeFile(
    path.join(path.dirname(outputPath), "warnings_safeguarding.txt"),
    logs.join("\n") + "\n",
    logError
);


function addSafeguarding(node, flow, keywordsEng, keywordsByLanguage, noCases = false) {
    const sendMsgId = findSendMsgParentId(flow, node.uuid);

    // generate uuid for the 2 nodes to add
    const enterFlowNodeId = uuid.v4();
    const splitNodeId = uuid.v4();
    const saveResultNodeId = uuid.v4();

    //add category with safeguarding keywords to wfr node
    addSafeguardingCategory(
        flow,
        node,
        enterFlowNodeId,
        keywordsEng,
        keywordsByLanguage
    );

    flow.nodes.push(
        generateEnterFlowNode(
            enterFlowNodeId,
            saveResultNodeId,
            safeguardingFlowName,
            safeguardingFlowId));
    flow.nodes.push(
        generateSaveResultNode(saveResultNodeId, splitNodeId));
    flow.nodes.push(
        generateSplitByResultNode(splitNodeId, sendMsgId));

    if (noCases) {
        node.router.operand = "@input.text";
    }
}


function addSafeguardingCategory(
    flow, waitForResponseNode, destId, keywordsEng, keywordsByLanguage
) {
    const sgCase = {
        arguments: [keywordsEng.join(",")],
        type: "has_any_word",
        uuid: uuid.v4(),
        category_uuid: uuid.v4(),
    };
    waitForResponseNode.router.cases.push(sgCase);

    for (const lang in keywordsByLanguage) {
        if (!flow.hasOwnProperty("localization")){
            flow.localization = {};
        }
        if (!flow.localization.hasOwnProperty(lang)){
            flow.localization[lang] = {};
        }
        flow.localization[lang][sgCase.uuid] = {
            arguments: [keywordsByLanguage[lang].join(",")]
        };
    }

    const category = {
        uuid: sgCase.category_uuid,
        name: "Safeguarding",
        exit_uuid: uuid.v4(),
    };
    waitForResponseNode.router.categories.push(category);

    const exit = {
        uuid: category.exit_uuid,
        destination_uuid: destId,
    };
    waitForResponseNode.exits.push(exit);

    return exit.destination_uuid;
}

function generateEnterFlowNode(nodeId, destId, flowName, flowId) {
    const exits = [
        {
            uuid: uuid.v4(),
            destination_uuid: destId,
        },
        {
            uuid: uuid.v4(),
            destination_uuid: destId,
        },
    ];
    const categories = [
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

    return {
        actions: [
            {
                flow: {
                    name: flowName,
                    uuid: flowId
                },
                type: "enter_flow",
                uuid: uuid.v4(),
            }
        ],
        exits: exits,
        router: {
            cases: [
                {
                    uuid: uuid.v4(),
                    type: "has_only_text",
                    arguments: ["completed"],
                    category_uuid: categories[0].uuid,
                },
                {
                    uuid: uuid.v4(),
                    type: "has_only_text",
                    arguments: ["expired"],
                    category_uuid: categories[1].uuid,
                },
            ],
            categories: categories,
            operand: "@child.run.status",
            type: "switch",
            default_category_uuid: categories[1].uuid,
        },
        uuid: nodeId,
    };
}

function generateSaveResultNode(nodeId, destId){
    return {
        actions: [
            {
                type: "set_run_result",
                name: "sg_back",
                value: "@child.results.sg_back",
                uuid: uuid.v4()
            }

        ],
        exits: [
            {
                destination_uuid: destId,
                uuid: uuid.v4()
            }
        ],
        uuid: nodeId,
    };
}

function generateSplitByResultNode(nodeId, destId) {
    const exits = [
        {
            uuid: uuid.v4()
        },
        {
            destination_uuid: destId,
            uuid: uuid.v4()
        }
    ];
    const categories = [
        {
            uuid: uuid.v4(),
            name: "Other",
            exit_uuid: exits[0].uuid,
        },
        {
            uuid: uuid.v4(),
            name: "Yes",
            exit_uuid: exits[1].uuid,
        }
    ];

    return {
        actions: [],
        exits: exits,
        router: {
            cases: [
                {
                    uuid: uuid.v4(),
                    type: "has_any_word",
                    arguments: ["yes"],
                    category_uuid: categories[1].uuid,
                }
            ],
            categories: categories,
            operand: "@child.results.sg_back",
            type: "switch",
            default_category_uuid: categories[0].uuid,
        },
        uuid: nodeId,
    };
}


// Find UUID of the send_message node parent of the wfr node
function findSendMsgParentId(flow, nodeId) {
    const parents = flow.nodes.filter(node => isParent(node, nodeId));

    if (parents.length == 0) {
        return null;
    }

    if (parents.length == 1) {
        // if there is only one parent and the parent is of type send_msg (has
        // at least one action of that type), that's the send_msg parent node
        if (isSendMsg(parents[0])) {
            return parents[0].uuid;
        }
        else {
            logs.push("----------------------------------------------");
            logs.push("only one parent but not send_msg");
            logs.push(flow.name);
            logs.push(parents[0].uuid);
            return null;
        }
    }

    const grandparents = parents.map(node => findParents(node, flow));
    // if all the parent nodes have a single parent and that parent is in
    // common (==> it's a router), that's the output

    if (isSameGrandparent(grandparents)) {
        return grandparents[0][0];
    }
    else {
        const sendMsgParents = parents.filter(node => isSendMsg(node));
        if (sendMsgParents.length == parents.length) {
            // if one of the parent send_msg nodes is of type "Sorry I don't
            // understand", return that node otherwise return the last in the
            // list
            for (const parent of parents.reverse()) {
                const action = findSendMsgAction(parent);
                if (action && action.text.startsWith("Sorry")) {
                    return parent.uuid;
                }
            }

            return parents.at(-1).uuid;
        }
        else {
            // for the parents that are not of type send_msg, find the parent
            const mixedGenerationNodes = parents
                  .map(node => findFirstParentIfNotSendMsg(node, flow));
            const sendMsgMixedGenerationNodes = mixedGenerationNodes
                  .filter(node => isSendMsg(node));
            if (sendMsgMixedGenerationNodes.length == mixedGenerationNodes.length) {
                // if one of the parent send_msg nodes is of type "Sorry I don't
                // understand", return that node otherwise return the last in the
                // list
                for (const node of mixedGenerationNodes.reverse()) {
                    const action = findSendMsgAction(node);
                    if (action && action.text.startsWith("Sorry")) {
                        return node.uuid;
                    }
                }

                return mixedGenerationNodes.at(-1).uuid;
            } else {
                logs.push("----------------------------------------------");
                logs.push("OTHER CASE");
                logs.push(flow.name);
                logs.push(nodeId);
            }
        }
    }

    // return null if the node has no send_msg parent (or grandparent) node
    return null;
}


function isParent(node, childId) {
    return node.exits.some(exit => exit.destination_uuid == childId);
}


function isSendMsg(node) {
    return node.actions.some(action => action.type == "send_msg");
}

function findSendMsgAction(node){
    return node.actions.find(action => action.type == "send_msg");
}

function findParents(node, flow) {
    return flow.nodes
        .filter(n => isParent(n, node.uuid))
        .map(n => n.uuid);
}

function findFirstParentIfNotSendMsg(node, flow) {
    if (isSendMsg(node)) {
        return node;
    } else {
        return flow.nodes.find(n => isParent(n, node.uuid)) || node;
    }
}

function isSameGrandparent(nodesIds) {
    const parentId = nodesIds[0][0];
    return nodesIds
        .every(nodeList => nodeList.length == 1 && nodeList[0] == parentId);
}

function isWaitForResponse(node) {
    return node.hasOwnProperty('router')
        && node.router.operand == "@input.text"
        && node.router.hasOwnProperty("wait");
}


function isNoCaseWaitForResponse(node) {
    return node.hasOwnProperty('router')
        && node.router.operand == "@input"
        && node.router.hasOwnProperty("wait");
}

function logError(err) {
    if (err) console.log('error', err);
}
