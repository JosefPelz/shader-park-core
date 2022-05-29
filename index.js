import {
    glslToThreeJSShaderSource,
    glslToThreeJSMaterial,
    glslToThreeJSMesh,
    sculptToThreeJSShaderSource,
    sculptToThreeJSMaterial,
    sculptToThreeJSMesh,
    createSculpture,
    createSculptureWithGeometry
} from './targets/threeJS.js'

import {
    glslToOfflineRenderer,
    sculptToOfflineRenderer
} from './targets/offlineRenderer.js'

import {
    sculptToMinimalRenderer,
    glslToMinimalRenderer
} from './targets/minimalRenderer.js'

import {
    sculptToMinimalHTMLRenderer,
    glslToMinimalHTMLRenderer,
} from './targets/minimalHTMLRenderer.js'

import {
    sculptToRawSDF4Meshing
} from './targets/rawSDF4Meshing.js'

import {
    glslToTouchDesignerShaderSource, 
    sculptToTouchDesignerShaderSource
} from './targets/touchDesigner.js'

import {
    defaultFragSourceGLSL,
    usePBRHeader,
    useHemisphereLight,
    sculptureStarterCode,
    minimalHeader,
    minimalVertexSource,
    fragFooter
} from './glsl/glsl-lib.js'

import {
    bindStaticData,
    sculptToGLSL,
    baseUniforms, 
    uniformsToGLSL
} from './generators/sculpt.js'

console.log('using shader-park-core version: [VI]{version}[/VI]');

/// Generate code for various targets

export {
    glslToThreeJSShaderSource,
    glslToThreeJSMaterial,
    glslToThreeJSMesh,
    sculptToThreeJSShaderSource,
    sculptToThreeJSMaterial,
    sculptToThreeJSMesh,
    createSculptureWithGeometry,
    createSculpture,
    bindStaticData,
    glslToOfflineRenderer,
    sculptToOfflineRenderer,
    glslToTouchDesignerShaderSource,
    sculptToTouchDesignerShaderSource,
    sculptToMinimalRenderer,
    sculptToMinimalHTMLRenderer,
    glslToMinimalRenderer,
    glslToMinimalHTMLRenderer,
    sculptToRawSDF4Meshing,
    defaultFragSourceGLSL,
    sculptToGLSL,
    baseUniforms, 
    uniformsToGLSL,
    usePBRHeader,
    useHemisphereLight,
    sculptureStarterCode,
    minimalHeader,
    minimalVertexSource,
    fragFooter
}
