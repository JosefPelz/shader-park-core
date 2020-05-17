/**
 * Converts sculpt lang to JS which generates GLSL
 */

import {
	geometryFunctions, 
	mathFunctions, 
	glslBuiltInOneToOne, 
	glslBuiltInOther
} from '../glsl/bindings.js';

import * as escodegen from 'escodegen';
import * as esprima from 'esprima';

function buildGeoSource(geo) {
	return `
float surfaceDistance(vec3 p) {
	vec3 normal = vec3(0.0,1.0,0.0);
	vec3 mouseIntersect = vec3(0.0,1.0,0.0);
    float d = 100.0;
    vec3 op = p;
${geo}
    return scope_0_d;
}`;
}

function buildColorSource(col, useLighting) {
	let lgt = useLighting ? '' : '    return scope_0_material.albedo;';
	return `
vec3 shade(vec3 p, vec3 normal) {
    float d = 100.0;
    vec3 op = p;
	vec3 lightDirection = vec3(0.0, 1.0, 0.0);
	vec3 mouseIntersect = vec3(0.0,1.0,0.0);
	#ifdef USE_PBR
	Material material = Material(vec3(1.0),0.5,0.7,1.0);
	Material selectedMaterial = Material(vec3(1.0),0.5,0.7,1.0);
	#else
	float light = 1.0;
	float occ = 1.0;
    vec3 color = vec3(1.0,1.0,1.0);
	vec3 selectedColor = vec3(1.0,1.0,1.0);
	#endif
${col}
${lgt}
	#ifdef USE_PBR
	return pbrLighting(
		worldPos.xyz,
		normal,
		lightDirection,
		scope_0_material
		);
	#else
	return scope_0_material.albedo*simpleLighting(p, normal, lightDirection);*occ;
	#endif
}`;
}

let _operators = {
	'*': (a, b) => a * b,
	'/': (a, b) => a / b,
	'-': (a, b) => a - b,
	'+': (a, b) => a + b,
	'==': (a, b) => a == b,
	'!=': (a, b) => a != b,
	'===': (a, b) => a === b,
	'!==': (a, b) => a !== b,
	'>': (a, b) => a > b,
	'>=': (a, b) => a >= b,
	'<': (a, b) => a < b,
	'<=': (a, b) => a <= b,
}



function replaceIf(syntaxTree) {
	if (typeof syntaxTree === 'object') {
		for (let node in syntaxTree) {
			if (syntaxTree.hasOwnProperty(node)) {
				replaceIf(syntaxTree[node]);
			}
		}
	}
	if (!syntaxTree) {
		console.log('no syntax tree')
		return;
	}

	if (syntaxTree.type === 'IfStatement') {
		let trueCondition = syntaxTree.consequent;
		let falseCondition = syntaxTree.alternate;

		let lambda1 = {
			"type": "FunctionExpression",
			"id": null,
			"params": [],
			"body": trueCondition,
			"generator": false,
			"expression": false,
			"async": false
		};
		
		let args = [syntaxTree.test, lambda1];
		
		if (falseCondition) {
			console.log('falseCondition', falseCondition);
			// if (falseCondition.arguments && falseCondition.arguments.length === 3 ) {
			// 	let lastArg = falseCondition.arguments[2];
			// 	let functionBody = {
			// 		"type": "BlockStatement",
			// 		"body": lastArg
			// 	}
			// 	falseCondition.arguments[2] = functionBody;
			// }
			// let lambda2 = Object.assign({}, lambda1);
			let lambda2 = {
				"type": "FunctionExpression",
				"id": null,
				"params": [],
				"body": {
					"type": "BlockStatement",
					"body": [falseCondition]
				},
				"generator": false,
				"expression": false,
				"async": false
			};
			
			// lambda2.body = falseCondition;
			args.push(lambda2);
		}

		delete syntaxTree.test;
		delete syntaxTree.alternate;
		delete syntaxTree.consequent;

		let newSyntaxTree =  {
			"type": "ExpressionStatement",
			"expression": {
				"type": "CallExpression",
				"callee": { type: 'Identifier', name: '_if' },
				"arguments": args,
			}
		}
		Object.entries(newSyntaxTree).forEach(([key, val]) => syntaxTree[key] = val);
		// Object.assign(syntaxTree, newSyntaxTree);
		console.log('updated Syntax tree', syntaxTree);
	}


}

// Converts binary math _operators to our own version
function replaceBinaryOp(syntaxTree) {

	if (typeof syntaxTree === 'object') {
		for (let node in syntaxTree) {
			if (syntaxTree.hasOwnProperty(node)) {
				replaceBinaryOp(syntaxTree[node]);
			}
		}
	}
	if(!syntaxTree) {
		console.log('no syntax tree')
		return;
	}

	if (syntaxTree.type === 'UnaryExpression') {
		let op = syntaxTree.operator;
		if(op === '!') {
			syntaxTree.callee = { type: 'Identifier', name: '_not' };
			syntaxTree.type = 'CallExpression';
			syntaxTree.arguments = [syntaxTree.argument];
			delete syntaxTree.operator;
		}
	}

	if ( syntaxTree['type'] === 'BinaryExpression') {
		let op = syntaxTree.operator;
		if(op in _operators) {
			if(op === '===') {
				op = '==';
			} else if(op === '!==') {
				op = '!=';
			}
			syntaxTree.callee = { type: 'Identifier', name: '_binaryOp' };
			syntaxTree.type = 'CallExpression';
			syntaxTree.arguments = [syntaxTree.left, syntaxTree.right, { 'type': 'Literal', 'value': op, 'raw': `'${op}'`}];
			delete syntaxTree.operator;
			delete syntaxTree.left;
			delete syntaxTree.right;
		}
	}
}

function replaceVariableDeclaration(syntaxTree) {
	if (syntaxTree && typeof syntaxTree === "object") {
		for (let node in syntaxTree) {
			if (syntaxTree.hasOwnProperty(node)) {
				replaceVariableDeclaration(syntaxTree[node]);
			}
		}
	}
	if (syntaxTree && typeof syntaxTree === "object" && 'type' in syntaxTree
		&& syntaxTree.type === 'VariableDeclaration'
		&& 'declarations' in syntaxTree
		&& syntaxTree.declarations.length) {
		console.log('hitting VariableDeclaration', syntaxTree);
		let declarations = syntaxTree.declarations;
		let declaration = declarations[declarations.length - 1];
		declaration.init = {
			type: "CallExpression",
			callee: {
				type: "Identifier",
				name: "makeNamedVar"
			},
			arguments: [{
				type: "Literal",
				value: declaration.id.name,
				raw: `'${declaration.id.name}'`
			}, 
			{
				...declaration.init
			}]
		};
	}
}


function replaceOperatorOverload(syntaxTree) {
	if (syntaxTree && typeof syntaxTree === "object") {
		for (let node in syntaxTree) {
			if (syntaxTree.hasOwnProperty(node)) {
				replaceOperatorOverload(syntaxTree[node]);
			}
		}
	}
	if (syntaxTree && typeof syntaxTree === "object" && 'type' in syntaxTree 
		&& syntaxTree.type === 'ExpressionStatement'
		&& 'expression' in syntaxTree
		&& syntaxTree.expression.type === 'AssignmentExpression') {
		
		let op = syntaxTree.expression.operator;
		if (op === '+=' || op === '-=' || op === '/=' || op === '*=' || op === '%=') {
			syntaxTree.expression.operator = "=";

			syntaxTree.expression.right = {
				type: 'BinaryExpression',
				left: syntaxTree.expression.left,
				right: syntaxTree.expression.right
			}

			if(op === '+=') {
				syntaxTree.expression.right.operator =  '+';
			} else if(op === '-=') {
				syntaxTree.expression.right.operator = '-';
			} else if (op === '/=') {
				syntaxTree.expression.right.operator = '/';
			} else if (op === '*=') {
				syntaxTree.expression.right.operator = '*';
			} else if (op === '%=') {
				syntaxTree.expression.right.operator = '%';
			}
		}
	}
}

function replaceSliderInput(syntaxTree) {
	if (syntaxTree && typeof syntaxTree === "object") {
		for (let node in syntaxTree) {
			if (syntaxTree.hasOwnProperty(node)) {
				replaceSliderInput(syntaxTree[node]);
			}
		}
	}
	if (syntaxTree && typeof syntaxTree === "object" && 'type' in syntaxTree && syntaxTree['type'] === 'VariableDeclaration') {
		
		let d = syntaxTree['declarations'][0];
		let name = d.id.name;
		if (d && d.init && d.init.callee !== undefined && d.init.callee.name === 'input') {
			d.init.arguments.unshift({ type: "Literal", value: name, raw: name });
		}
	}
}

export function uniformsToGLSL(uniforms) {
	let uniformsHeader = '';
	for (let i=0; i<uniforms.length; i++) {
		let uniform = uniforms[i];
		uniformsHeader += `uniform ${uniform.type} ${uniform.name};\n`;
	}
	return uniformsHeader;
}

export function baseUniforms() {
	return [
		{name:'time', type: 'float', value: 0.0},
		{name:'opacity', type: 'float', value: 1.0},
		{name:'sculptureCenter', type: 'vec3', value: [0,0,0]},
		{name:'mouse', type: 'vec3', value: [0.5,0.5,0.5]},
		{name:'stepSize', type: 'float', value: 0.85}
	];
}

export function sculptToGLSL(userProvidedSrc) {
	const PI = Math.PI;
	const TWO_PI = Math.PI * 2;
	const TAU = TWO_PI;
	
	let debug = false;
	let tree = esprima.parse(userProvidedSrc);
	replaceOperatorOverload(tree);
	replaceBinaryOp(tree);
	replaceSliderInput(tree);
	replaceIf(tree);
	replaceVariableDeclaration(tree);
	console.log('tree1', tree)
	try {
		userProvidedSrc = escodegen.generate(tree);
	} catch (e) {
		console.log('errors')
		console.log(e)
	}
	console.log('userProvidedSrc', userProvidedSrc)
	if (debug) {
		console.log('tree', tree);
	}

	let generatedJSFuncsSource = "";
	let geoSrc = "";
	let colorSrc = "";
	let varCount = 0;
	let primCount = 0;
	let stateCount = 0;
	let useLighting = true;
	let stateStack = [];
	let uniforms = baseUniforms();
	let indentation = 1;

	let stepSizeConstant = 0.85;

	////////////////////////////////////////////////////////////
	// Generates JS from headers referenced in the bindings.js
	let primitivesJS = "";
	for (let [funcName, body] of Object.entries(geometryFunctions)) {
		let argList = body['args'];
		primitivesJS += "function " + funcName + "(";
		for (let argIdx = 0; argIdx < argList.length; argIdx++) {
			if (argIdx !== 0) primitivesJS += ", ";
			primitivesJS += "arg_" + argIdx;
		}
		primitivesJS += ") {\n";
		let argIdxB = 0;
		for (let argDim of argList) {
			if (argDim === 1) {
				primitivesJS += "    ensureScalar(\"" + funcName + "\", arg_" + argIdxB + ");\n";
			}
			argIdxB += 1;
		}
		primitivesJS += "    applyMode(\"" + funcName + "(\"+getCurrentState().p+\", \" + ";
		for (let argIdx = 0; argIdx < argList.length; argIdx++) {
			primitivesJS += "collapseToString(arg_" + argIdx + ") + ";
			if (argIdx < argList.length - 1) primitivesJS += "\", \" + ";
		}
		primitivesJS += "\")\");\n}\n\n";
	}
	generatedJSFuncsSource += primitivesJS;

	function generateGLSLWrapper(funcJSON) {
		let wrapperSrc = "";
		for (let [funcName, body] of Object.entries(funcJSON)) {
			let argList = body['args'];
			let returnType = body['ret'];
			wrapperSrc += "function " + funcName + "(";
			for (let argIdx = 0; argIdx < argList.length; argIdx++) {
				if (argIdx !== 0) wrapperSrc += ", ";
				wrapperSrc += "arg_" + argIdx;
			}
			wrapperSrc += ") {\n";
			let argIdxB = 0;
			for (let arg of argList) {
				wrapperSrc += "    arg_" + argIdxB + " = tryMakeNum(arg_" + argIdxB + ");\n";
				argIdxB += 1;
			}
			// debug here
			wrapperSrc += "    return new makeGLSLVarWithDims(\"" + funcName + "(\" + ";
			for (let argIdx = 0; argIdx < argList.length; argIdx++) {
				wrapperSrc += "arg_" + argIdx + " + ";
				if (argIdx < argList.length - 1) wrapperSrc += "\", \" + ";
			}
			wrapperSrc += "\")\", " + returnType + ");\n}\n";
		}
		return wrapperSrc;
	}

	let mathFunctionsJS = generateGLSLWrapper(mathFunctions);
	generatedJSFuncsSource += mathFunctionsJS;

	let builtInOtherJS = generateGLSLWrapper(glslBuiltInOther);
	generatedJSFuncsSource += builtInOtherJS;

	let builtInOneToOneJS = "";
	for (let funcName of glslBuiltInOneToOne) {
		builtInOneToOneJS +=
`function ${funcName}(x) {
    x = tryMakeNum(x);
	// debug here
	return new makeGLSLVarWithDims("${funcName}(" + x + ")", x.dims);
}
`;
	}
	generatedJSFuncsSource += builtInOneToOneJS;
	////////////////////////////////////////////////////////////
	//End Auto Generated Code

	// set step size directly
	function setStepSize(val) {
		if (typeof val !== 'number') {
			compileError("setStepSize accepts only a constant number. Was given: '" + val.type + "'");
		}
		stepSizeConstant = val;
	}
	// set step size on a scale 0-100
	function setGeometryQuality(val) {
		if (typeof val !== 'number') {
			compileError("setGeometryQuality accepts only a constant number between 0 and 100. Was given: '" + val.type + "'");
		}
		stepSizeConstant = 1-0.01*val*0.995;
	}

	function getCurrentState() {
		return stateStack[stateStack.length-1];
	}

	function getCurrentMode() {
		return getCurrentState().mode;
	}

	function getCurrentDist() {
		return getCurrentState().id+"d";
	}

	function getCurrentPos() {
		return getCurrentState().id+"p";
	}

	function getMainMaterial() {
		return getCurrentState().id+"material";
	}

	function getCurrentMaterial() {
		return getCurrentState().id+"currentMaterial";
	}

	function appendSources(source) {
		let currIndentation = '    '.repeat(indentation);
		geoSrc += currIndentation + source;
		colorSrc += currIndentation + source;
	}

	function appendColorSource(source) {
		colorSrc += "    " + source;
	}

	function updateVar(name, source) {
		if (source instanceof GLSLVar) {
			appendSources(`${name} = ${source}; \n`);
		}
		return source;
	}

	//takes a glsl variable and creates a non-inlined version in 
	function makeNamedVar(name, value) {
		if (value instanceof GLSLVar) {
			appendSources(`${value.type} ${name} = ${value.name}; \n`);
		}
		return value;
	}

	// General Variable class
	// Generates GLSL expression, or variable
	// function makeVar(source, type, dims, inline) {
	// 	console.log('make var', source, type, dims, inline)
	// 	let name = source;
	// 	if (!inline) {
	// 		name = "v_" + varCount;
	// 		appendSources(`${type} ${name} = ${source}; \n`);
	// 		varCount += 1;
	// 	}
	// 	return new GLSLVar(type, dims, name); //{ type, dims, name, toString: () => name, isGLSLVar: true }
	// }

	class GLSLVar {
		constructor(type, name, dims) {
			this.type = type;
			this.dims = dims;
			this.name = name;	
		}

		toString() {
			return this.name;
		}
	}

	// Need to handle cases like - vec3(v.x, 0.1, mult(0.1, time))

	function _bool(source) {
		console.log('inside Bool', source);
		source = collapseToString(source);
		console.log('collapsed', source);
		//flag the bool with 0 dimensions, so we can type check
		return new GLSLVar('bool', source, 0);
	}

	function float(source) {
		//if (typeof source !== 'string') {
			source = collapseToString(source);
		//}
		return new GLSLVar('float', source, 1);
	}

	function vec2(source, y) {
		if (y === undefined ) {
			y = source;
		}
		if (typeof source !== 'string') {
			source = "vec2(" + collapseToString(source) + ", " 
							 + collapseToString(y) + ")";
		}
		let self = new GLSLVar('vec2', source, 2);
		let currX = new makeGLSLVarWithDims(self.name + ".x", 1); 
		let currY = new makeGLSLVarWithDims(self.name + ".y", 1);
		let objs = { 'x': currX, 'y': currY};
		applyVectorAssignmentOverload(self, objs);

		return self;
	}

	function vec3(source, y, z) {
		if (y === undefined) {
			y = source;
			z = source;
		}
		if (typeof source !== 'string') {
			
			source = "vec3(" + collapseToString(source) + ", " 
							 + collapseToString(y) + ", " 
							 + collapseToString(z) + ")";
			
		}
		let self = new GLSLVar('vec3', source, 3);
		let currX = new makeGLSLVarWithDims(self.name + ".x", 1);
		let currY = new makeGLSLVarWithDims(self.name + ".y", 1);
		let currZ = new makeGLSLVarWithDims(self.name + ".z", 1);
		let objs = {'x': currX, 'y': currY, 'z': currZ};
		applyVectorAssignmentOverload(self, objs);
		return self;
	}

	function vec4(source, y, z, w) {
		if (y === undefined && z === undefined) {
			y = source;
			z = source;
			w = source;
		}
		if (typeof source !== 'string') {
			source = "vec4(" + collapseToString(source) + ", " 
							 + collapseToString(y) + ", " 
							 + collapseToString(z) + ", "
							 + collapseToString(w) + ")";
		}
		let self = new GLSLVar('vec4', source, 4);
		let currX = new makeGLSLVarWithDims(self.name + ".x", 1);
		let currY = new makeGLSLVarWithDims(self.name + ".y", 1);
		let currZ = new makeGLSLVarWithDims(self.name + ".z", 1);
		let currW = new makeGLSLVarWithDims(self.name + ".w", 1);
	let objs = { 'x': currX, 'y': currY, 'z': currZ, 'w': currW };
		applyVectorAssignmentOverload(self, objs);
		return self;
	}

	// allows the user to re-assign a vector's components
	function applyVectorAssignmentOverload(self, objs) {
		Object.entries(objs).forEach(([key, func]) => {
			Object.defineProperty(self, key, {
				get: () => func,
				set: (val) => appendSources(`${self.name}.${key} = ${val};\n`)
			});
		});
	}

	function makeGLSLVarWithDims(source, dims) {
		if (dims < 1 || dims > 4) compileError("Tried creating variable with dim: " + dims);
		if (dims === 1) return new float(source);
		if (dims === 2) return new vec2(source);
		if (dims === 3) return new vec3(source);
		if (dims === 4) return new vec4(source);
	}

	// Modes enum
	const modes = {
		UNION: 10,
		DIFFERENCE: 11,
		INTERSECT: 12,
		BLEND: 13,
		MIXGEO: 14,
	};
	const additiveModes = [modes.UNION, modes.BLEND, modes.MIXGEO];

	let time = new float("time");
	let mouse = new vec3("mouse");
	let normal = new vec3("normal");

	function mouseIntersection() {
		appendColorSource("mouseIntersect = mouseIntersection();\n");
		return new vec3("mouseIntersect");
	}

	function getRayDirection() {
		return new vec3("getRayDirection()");
	}

	function compileError(err) {
		// todo: throw actual error (and color error?)
		console.error(err, " char: " + geoSrc.length);
		throw err;
	}

	function ensureBoolean(funcName, val) {
		if (typeof val !== 'boolean' && val.type !== 'bool') {
			compileError(`${funcName} accepts only a boolean. Was given: ${val.type}`);
		}
	}

	function ensureScalar(funcName, val) {
		if (typeof val !== 'number' && val.type !== 'float') {
			compileError(`${funcName} accepts only a scalar. Was given: ${val.type}`);
		}
	}

	function ensureGroupOp(funcName, a, b) {
		if (typeof a !== 'string' && typeof b !== 'string') {
			if (a.dims !== 1 && b.dims !== 1 && a.dims !== b.dims) {
				compileError(`${funcName} dimension mismatch. Was given: ${a.type} and ${b.type}`);
			}
		}
	}

	function collapseToString(val) {
		if (typeof val === 'string') {
			return val;
		} else if (typeof val === 'number') {
			return val.toFixed(8);
		} else {
			return val.toString();
		}
	}

	// Modes (prepend these with GEO or something to indicate they are geometry modes?)
	// Also 'mix' name needs to be changed to avoid collision with built in

	function union() {
		stateStack[stateStack.length-1].mode = modes.UNION;
	}

	function difference() {
		stateStack[stateStack.length-1].mode = modes.DIFFERENCE;
	}

	function intersect() {
		stateStack[stateStack.length-1].mode = modes.INTERSECT;
	}

	function blend(amount) {
		stateStack[stateStack.length-1].mode = modes.BLEND;
		ensureScalar("blend",amount);
		stateStack[stateStack.length-1].blendAmount = amount;
	}

	function mixGeo(amount) {
		stateStack[stateStack.length-1].mode = modes.MIXGEO;
		ensureScalar("mixGeo",amount);
		stateStack[stateStack.length-1].mixAmount = amount;
	}

	function getMode() {
		switch (getCurrentState().mode) {
			case modes.UNION:
				return ["add"];
				break;
			case modes.DIFFERENCE:
				return ["subtract"];
				break;
			case modes.INTERSECT:
				return ["intersect"];
				break;
			case modes.BLEND:
				return ["smoothAdd",getCurrentState().blendAmount];
				break;
			case modes.MIXGEO:
				return ["mix",getCurrentState().mixAmount];
				break;
			default:
				return ["add"];
		}
	}

	function applyMode(prim, finalCol) {
		let cmode = getMode();
		let primName = "prim_" + primCount;
		primCount += 1;
		appendSources("float " + primName + " = " + prim + ";\n");
		if (additiveModes.includes(getCurrentState().mode)) {
			let selectedCC = finalCol !== undefined ? finalCol : getCurrentMaterial();
			appendColorSource("if (" + primName + " < "+ getCurrentDist() + ") { " + getMainMaterial() + " = " + selectedCC + "; }\n" );
		}
		appendSources(getCurrentDist() + " = "+ cmode[0] + "( " + primName + ", " + getCurrentDist() +  " " +
			(cmode.length > 1 ? "," + collapseToString(cmode[1]) : "") + " );\n");
	}

	function getSpace() {
		return getCurrentState().p;
	}

	function pushState() {
		stateStack.push({
			id: "scope_" + stateCount + "_",
			mode: modes.UNION,
			blendAmount: 0.0,
			mixAmount: 0.0,
		});
		appendSources("float " + getCurrentDist() + " = 100.0;\n");
		let lastP = stateStack.length > 1 ? stateStack[stateStack.length-2].id+"p" : "p";
		let lastMat = stateStack.length > 1 ? stateStack[stateStack.length-2].id+"currentMaterial" : "material";
		appendSources("vec3 " + getCurrentPos() + " = " + lastP + ";\n");
		appendColorSource("Material " + getMainMaterial() + " = " + lastMat + ";\n");
		appendColorSource("Material " + getCurrentMaterial() + " = " + lastMat + ";\n");
		stateStack[stateStack.length-1].p = vec3(stateStack[stateStack.length-1].id+"p");
                stateCount++;
	}

	function popState() {
		let lastDist = getCurrentDist();
		let lastMaty = getMainMaterial();
		stateStack.pop();
		applyMode(lastDist, lastMaty);
	}
	// !!! puts initial state on stack, this never comes off !!!
	pushState();

	function shape(func) {
		let makeShape = function() {
			pushState();
			let output = func.apply(this, arguments);
			popState();
			return output;
		}
		return makeShape;
	}

	//converts the provided arg into a glsl variable
	function tryMakeNum(v) {
		if (typeof v === 'number') {
			return new float(v);
		} 
		return v;
	}

	function tryMakeBool(v) {
		if (typeof v === 'boolean') {
			return new _bool(v);
		}
		return v;
	}

	// let x = 2;
	// if(time > 5) {
	// 	x = 1;
	// } else {
	// 	x = 2;
	// }

	// let x = 2;
	// _if(time > 5, function () {x = 1;}, function () { x = 2;})

	//impliments if in glsl
	function _if(condition, trueCase, falseCase) {
		// default the falseCase to a lambda, so we don't have to check if it exists
		// in the case someone defines just an if statement
		if (typeof trueCase !== 'function' || (falseCase && typeof falseCase !== 'function')) {
			compileError(`if condition, or else condition was not provided a function`);
		}
		if (typeof condition === 'boolean') {
			if(condition) {
				trueCase()
			} else {
				if (falseCase) {
					falseCase();
				}
			}
		} else {
			condition = tryMakeBool(condition);
			ensureBoolean('if', condition);
			appendSources(`if(${collapseToString(condition)}) {\n`);
			indentation += 1;
			trueCase();
			indentation -= 1;
			if (falseCase) {
				appendSources(`} else {\n`);
				indentation += 1;
				falseCase();
				indentation -= 1;
			}
			appendSources(`}\n`);
		}
	}

	//implements ! operator
	function _not(arg) {
		if (typeof arg === 'boolean') return !arg;
		arg = tryMakeBool(arg);
		ensureBoolean('!', arg);
		return _bool('!' + arg.name);
	}

	/// Math ///
	// Group ops
	function _binaryOp(left, right, symbol) {
		// console.log('hit binaryOP', symbol, symbol.value)
		let expression = _operators[symbol];
		console.log('expression',expression)
		if (typeof left === 'number' && typeof right === 'number') return expression(left, right);
		console.log('Called expression')
		left = tryMakeNum(left);
		right = tryMakeNum(right);

		console.log('SYMBOL', symbol, typeof symbol);
		if ( symbol === '==' || symbol === '!=' ||
			symbol === '>' || symbol === '>=' || symbol === '<' || symbol === '<=') {
			ensureScalar(symbol, left);
			ensureScalar(symbol, right);
			console.log('comparison worked',)
			return _bool(`(${collapseToString(left)} ${symbol} ${collapseToString(right)})`);
			//return new makeVar(`(${collapseToString(left)} ${symbol} ${collapseToString(right)})`, 'bool', 1);
		} else {
			ensureGroupOp(symbol, left, right);
			// called for *, -, +, /
			let dims = Math.max(left.dims, right.dims);
			return new makeGLSLVarWithDims(`(${collapseToString(left)} ${symbol} ${collapseToString(right)})`, dims);
		}
	}
	
	function setSDF(dist) {
		ensureScalar("setSDF", dist);
		applyMode(collapseToString(dist));
	}
	
	function getSDF() {
		return float(getCurrentDist());
	}

	// Displacements

	function reset() {
		if (stateStack.length > 1) {
			appendSources(getCurrentPos()+" = " + stateStack[stateStack.length-2].id+"p;\n");
		} else {
			appendSources(getCurrentPos()+" = op;\n");
		}
	}

	function displace(xc, yc, zc) {
		if (yc === undefined || zc === undefined) {
			appendSources(getCurrentPos()+" -= " + collapseToString(xc) + ";\n");
		} else {
			ensureScalar("displace",xc);
			ensureScalar("displace",yc);
			ensureScalar("displace",zc);
			appendSources(getCurrentPos()+" -= vec3( " + collapseToString(xc) + ", " 
								 + collapseToString(yc) + ", " 
								 + collapseToString(zc) + ");\n");
		}
	}

	function setSpace(xc, yc, zc) {
		if (yc === undefined || zc === undefined) {
			appendSources(getCurrentPos()+" = " + collapseToString(xc) + ";\n");
		} else {
			ensureScalar("setSpace",xc);
			ensureScalar("setSpace",yc);
			ensureScalar("setSpace",zc);
			appendSources(getCurrentPos()+" = vec3( " + collapseToString(xc) + ", " 
								 + collapseToString(yc) + ", " 
								 + collapseToString(zc) + ");\n");
		}
	}
	
	function repeat(spacing, repetitions) {
		let spc = collapseToString(spacing);
		let reps = collapseToString(repetitions);
		appendSources(getCurrentPos()+" = " + getCurrentPos() + "-" + spc +"*clamp(round(" + getCurrentPos() + "/" + spc + "),-" + reps + " ," + reps + ");\n");
	}

	function rotateX(angle) {
		ensureScalar("rotateX",angle);
		appendSources(getCurrentPos()+".yz = " + getCurrentPos() + ".yz*rot2(" + collapseToString(angle) + ");\n");
	}

	function rotateY(angle) {
		ensureScalar("rotateY",angle);
		appendSources(getCurrentPos()+".xz = " + getCurrentPos() + ".xz*rot2(" + collapseToString(angle) + ");\n");
	}

	function rotateZ(angle) {
		ensureScalar("rotateZ",angle);
		appendSources(getCurrentPos()+".xy = " + getCurrentPos() + ".xy*rot2(" + collapseToString(angle) + ");\n");
	}

	function mirrorX() {
		appendSources(getCurrentPos()+".x = abs(" + getCurrentPos() + ".x);\n");
	}

	function mirrorY() {
		appendSources(getCurrentPos()+".y = abs(" + getCurrentPos() + ".y);\n");
	}

	function mirrorZ() {
		appendSources(getCurrentPos()+".z = abs(" + getCurrentPos() + ".z);\n");
	}

	function mirrorXYZ() {
		appendSources(getCurrentPos()+" = abs(" + getCurrentPos() + ");\n");
	}

	function flipX() {
		appendSources(getCurrentPos()+".x = -" + getCurrentPos() + ".x;\n");
	}

	function flipY() {
		appendSources(getCurrentPos()+".y = -" + getCurrentPos() + ".y;\n");
	}

	function flipZ() {
		appendSources(getCurrentPos()+".z = -" + getCurrentPos() + ".z;\n");
	}

	function expand(amount) {
		ensureScalar("expand",amount);
		appendSources(getCurrentDist() + " -= " + collapseToString(amount) + ";\n");
	}

	function shell(depth) {
		ensureScalar("shell",depth);
		appendSources(getCurrentDist() + " = shell( " + getCurrentDist() +  "," + collapseToString(depth) + ");\n");
	}

	// Color/Lighting

	function color(col, green, blue) {
		if (green !== undefined) {
			ensureScalar("color", col);
			ensureScalar("color", green);
			ensureScalar("color", blue);
			appendColorSource(getCurrentMaterial() + ".albedo = vec3(" + 
				collapseToString(col) + ", " + 
				collapseToString(green) + ", " +
				collapseToString(blue) + ");\n");
		} else {
			if (col.type !== 'vec3') compileError("albedo must be vec3");
			appendColorSource(getCurrentMaterial() + ".albedo = " + collapseToString(col) + ";\n");
		}
	}

	function metal(val) {
		ensureScalar("metal", val);
		appendColorSource(getCurrentMaterial() + ".metallic = " + 
			collapseToString(val) + ";\n");
	}

	function shine(val) {
		ensureScalar("shine", val);
		appendColorSource(getCurrentMaterial() + ".roughness = 1.0-" + 
			collapseToString(val) + ";\n");
	}

	function lightDirection(x, y, z) {
		if (y === undefined || z === undefined) {
			appendColorSource("lightDirection = " + collapseToString(x) + ";\n");
		} else {
			ensureScalar("lightDirection", x);
			ensureScalar("lightDirection", y);
			ensureScalar("lightDirection", z);
			appendColorSource("lightDirection = vec3( " + collapseToString(x) + ", "
				+ collapseToString(y) + ", "
				+ collapseToString(z) + ");\n");
		}
	}
	// should this also be 'op'? 
	function noLighting() {
		useLighting = false;
	}

	// replaced with a noop for now to prevent errors
	function basicLighting() {}

	function occlusion(amount) {
		let amt = "1.0";
		if (amount !== undefined) {
			ensureScalar("occlusion", amount);
			amt = collapseToString(amount);
		} 
		appendColorSource(getCurrentMaterial() + ".ao = mix(1.0, occlusion(op,normal), " + amt + ");\n");
	}

	function test() {
		appendSources("//this is a test\n");
	}

	function input(name, value=0.0, min = 0.0, max = 1.0) {
		if (typeof value !== 'number' || typeof min !== 'number' || typeof max !== 'number') {
			compileError('input value, min, and max must be constant numbers');
		}
		uniforms.push({name, type:'float', value, min, max});
		return new float(name);
	}
	
	/*
	function input2(name, x, y) {
		console.log('input2',name, x, y);
		let uniform = {name, type: 'vec2'};
		let out = x;
		if(y === undefined) {
			uniform.value = x;
		} else {
			out = new vec2(x, y);
			uniform.value = out;
		}
		uniforms.push(uniform);
		return out;
	}
	*/

	let error = undefined;
	function getSpherical() {
		toSpherical(getSpace());
	}
	
	// Define any code that needs to reference auto generated from bindings.js code here
	let postGeneratedFunctions = [
		getSpherical,
	].map(el => el.toString()).join('\n');
	
	eval(generatedJSFuncsSource + postGeneratedFunctions + userProvidedSrc);
	
	let geoFinal = buildGeoSource(geoSrc);
	console.log(geoFinal);
	let colorFinal = buildColorSource(colorSrc, useLighting);
	return {
		uniforms: uniforms,
		stepSizeConstant: stepSizeConstant,
		geoGLSL: geoFinal,
		colorGLSL: colorFinal,
		error: error
	};
}
