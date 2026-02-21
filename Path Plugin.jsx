/* ==========================================================================
   Path Plugin v3.0 — Expression-Driven Logo Anatomy for After Effects
   Construction-style animation: Trim Paths for lines, Scale pops for dots.
   Zero opacity animation. Everything draws on or pops in.

   Usage: File > Scripts > Run Script File > select this file
   Requires: After Effects CC 2018 (15.1) or later
   ========================================================================== */

(function () {

    // ===================================================================
    //  UTILITIES
    // ===================================================================

    function getComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    function getShapeLayers(comp) {
        var out = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i) instanceof ShapeLayer) out.push(comp.layer(i));
        }
        return out;
    }

    function esc(s) { return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

    // ===================================================================
    //  PATH DISCOVERY
    // ===================================================================

    function discoverPaths(layer) {
        var results = [];
        function walk(group, chain) {
            if (!group) return;
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (!p) continue;
                if (p.matchName === "ADBE Vector Shape - Group") {
                    var pp = p.property("ADBE Vector Shape");
                    if (pp) {
                        results.push({
                            pathProp: pp,
                            chain: chain.slice(),
                            pathName: p.name
                        });
                    }
                } else if (p.matchName === "ADBE Vector Group") {
                    var sub = chain.slice();
                    sub.push(p.name);
                    walk(p.property("ADBE Vectors Group"), sub);
                }
            }
        }
        walk(layer.property("ADBE Root Vectors Group"), []);
        return results;
    }

    // ===================================================================
    //  EXPRESSION BUILDERS — coordinate transforms
    // ===================================================================

    var CTRL = 'thisComp.layer("PP_Control")';

    function buildPathExpr(layerName, chain, pathName) {
        var e = 'thisComp.layer("' + esc(layerName) + '")';
        for (var i = 0; i < chain.length; i++) {
            e += '.content("' + esc(chain[i]) + '")';
        }
        e += '.content("' + esc(pathName) + '").path';
        return e;
    }

    function buildGroupTransformExpr(layerName, chain) {
        var lines = [];
        var srcRef = 'thisComp.layer("' + esc(layerName) + '")';
        for (var i = chain.length - 1; i >= 0; i--) {
            var contentPath = srcRef;
            for (var j = 0; j <= i; j++) {
                contentPath += '.content("' + esc(chain[j]) + '")';
            }
            var tf = contentPath + '.transform';
            var gIdx = chain.length - 1 - i;
            lines.push('var ga' + gIdx + ' = ' + tf + '.anchorPoint;');
            lines.push('var gp' + gIdx + ' = ' + tf + '.position;');
            lines.push('var gs' + gIdx + ' = ' + tf + '.scale;');
            lines.push('var gr' + gIdx + ' = ' + tf + '.rotation * Math.PI / 180;');
        }
        lines.push('function applyGT(pt) {');
        lines.push('  var x = pt[0], y = pt[1];');
        for (var k = 0; k < chain.length; k++) {
            lines.push('  x -= ga' + k + '[0]; y -= ga' + k + '[1];');
            lines.push('  x *= gs' + k + '[0]/100; y *= gs' + k + '[1]/100;');
            lines.push('  var co' + k + ' = Math.cos(gr' + k + '), si' + k + ' = Math.sin(gr' + k + ');');
            lines.push('  var nx' + k + ' = x*co' + k + ' - y*si' + k + ';');
            lines.push('  y = x*si' + k + ' + y*co' + k + '; x = nx' + k + ';');
            lines.push('  x += gp' + k + '[0]; y += gp' + k + '[1];');
        }
        lines.push('  return [x, y];');
        lines.push('}');
        return lines.join('\n');
    }

    function buildLayerTransformExpr(layerName) {
        var srcRef = 'thisComp.layer("' + esc(layerName) + '")';
        return [
            'var _la = ' + srcRef + '.anchorPoint;',
            'var _lp = ' + srcRef + '.position;',
            'var _ls = ' + srcRef + '.scale;',
            'var _lr = ' + srcRef + '.rotation * Math.PI / 180;',
            'function applyLT(pt) {',
            '  var x = pt[0] - _la[0], y = pt[1] - _la[1];',
            '  x *= _ls[0]/100; y *= _ls[1]/100;',
            '  var co = Math.cos(_lr), si = Math.sin(_lr);',
            '  return [x*co - y*si + _lp[0], x*si + y*co + _lp[1]];',
            '}'
        ].join('\n');
    }

    // ===================================================================
    //  EXPRESSION BUILDERS — element positions / paths
    // ===================================================================

    function exprVertexCompPos(layerName, chain, pathName, vertexIdx) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var localPt = pathRef.points()[' + vertexIdx + '];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'applyLT(applyGT(localPt));'
        ].join('\n');
    }

    function exprInTangentCompPos(layerName, chain, pathName, vertexIdx) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var v = pathRef.points()[' + vertexIdx + '];',
            'var t = pathRef.inTangents()[' + vertexIdx + '];',
            'var localPt = [v[0]+t[0], v[1]+t[1]];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'applyLT(applyGT(localPt));'
        ].join('\n');
    }

    function exprOutTangentCompPos(layerName, chain, pathName, vertexIdx) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var v = pathRef.points()[' + vertexIdx + '];',
            'var t = pathRef.outTangents()[' + vertexIdx + '];',
            'var localPt = [v[0]+t[0], v[1]+t[1]];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'applyLT(applyGT(localPt));'
        ].join('\n');
    }

    function exprHandleLineCompPath(layerName, chain, pathName, vertexIdx, tangentType) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        var tanMethod = tangentType === "in" ? "inTangents" : "outTangents";
        return [
            'var pathRef = ' + pathRef + ';',
            'var v = pathRef.points()[' + vertexIdx + '];',
            'var t = pathRef.' + tanMethod + '()[' + vertexIdx + '];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'var p1 = applyLT(applyGT(v));',
            'var p2 = applyLT(applyGT([v[0]+t[0], v[1]+t[1]]));',
            'createPath([p1, p2], [], [], false);'
        ].join('\n');
    }

    function exprOutlineCompPath(layerName, chain, pathName, numVerts, closed) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var pts = pathRef.points();',
            'var inT = pathRef.inTangents();',
            'var outT = pathRef.outTangents();',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'var cPts = [], cIn = [], cOut = [];',
            'for (var i = 0; i < pts.length; i++) {',
            '  cPts.push(applyLT(applyGT(pts[i])));',
            '  var iv = inT[i]; var ov = outT[i];',
            '  var org = applyLT(applyGT([0,0]));',
            '  var ivT = applyLT(applyGT(iv));',
            '  var ovT = applyLT(applyGT(ov));',
            '  cIn.push([ivT[0]-org[0], ivT[1]-org[1]]);',
            '  cOut.push([ovT[0]-org[0], ovT[1]-org[1]]);',
            '}',
            'createPath(cPts, cIn, cOut, ' + (closed ? 'true' : 'false') + ');'
        ].join('\n');
    }

    function exprGridVerticalComp(layerName, chain, pathName, vertexIdx, yMin, yMax) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var localPt = pathRef.points()[' + vertexIdx + '];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'var cp = applyLT(applyGT(localPt));',
            'createPath([[cp[0],' + yMin + '],[cp[0],' + yMax + ']], [], [], false);'
        ].join('\n');
    }

    function exprGridHorizontalComp(layerName, chain, pathName, vertexIdx, xMin, xMax) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var localPt = pathRef.points()[' + vertexIdx + '];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'var cp = applyLT(applyGT(localPt));',
            'createPath([[' + xMin + ',cp[1]],[' + xMax + ',cp[1]]], [], [], false);'
        ].join('\n');
    }

    function exprLabelText(layerName, chain, pathName, vertexIdx) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var localPt = pathRef.points()[' + vertexIdx + '];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'var cp = applyLT(applyGT(localPt));',
            '"(" + Math.round(cp[0]) + ", " + Math.round(cp[1]) + ")";'
        ].join('\n');
    }

    function exprLabelPos(layerName, chain, pathName, vertexIdx) {
        var pathRef = buildPathExpr(layerName, chain, pathName);
        return [
            'var pathRef = ' + pathRef + ';',
            'var localPt = pathRef.points()[' + vertexIdx + '];',
            buildGroupTransformExpr(layerName, chain),
            buildLayerTransformExpr(layerName),
            'var cp = applyLT(applyGT(localPt));',
            'var off = ' + CTRL + '.effect("Labels Offset")(1);',
            '[cp[0] + off[0], cp[1] + off[1] - 14];'
        ].join('\n');
    }

    // ===================================================================
    //  EXPRESSION BUILDERS — animation (construction-style)
    //
    //  Timeline (0-100) maps to phases:
    //    Grid:     0-30    Outline:  10-55
    //    Anchors: 30-65    Handles: 50-80    Labels: 65-95
    //
    //  Each element also has an individual override slider (0-100).
    //  If override < 100, use it directly. Otherwise derive from Timeline.
    //
    //  Easing slider (0-100) controls ease-out exponent:
    //    0 = linear, 50 = smooth, 100 = snappy punch
    // ===================================================================

    var EASE_SNIPPET = [
        'var C = ' + CTRL + ';',
        'var _eAmt = clamp(C.effect("Easing")(1), 0, 100);',
        'function ez(p) {',
        '  var k = 1 + _eAmt / 25;',
        '  return 1 - Math.pow(Math.max(1 - p, 0), k);',
        '}'
    ].join('\n');

    function phaseExpr(sliderName, phaseStart, phaseEnd) {
        return [
            'var _ov = C.effect("' + sliderName + '")(1);',
            'var _tl = clamp(C.effect("Timeline")(1), 0, 100);',
            'var _raw = (_ov < 100) ? _ov / 100 : clamp((_tl - ' + phaseStart + ') / ' + (phaseEnd - phaseStart) + ', 0, 1);'
        ].join('\n');
    }

    function staggerExpr(idx, total) {
        var normT = total > 1 ? (idx + '.0 / ' + (total - 1) + '.0') : '0';
        return [
            'var _sg = clamp(C.effect("Stagger")(1), 0, 100) / 100;',
            'var _si = ' + normT + ';',
            'var _start = _si * _sg;',
            'var _w = Math.max(1 - _sg, 0.01);',
            'var _p = clamp((_raw - _start) / _w, 0, 1);',
            'var _ep = ez(_p);'
        ].join('\n');
    }

    // Trim End expression for a draw-on effect (no stagger — whole group draws)
    function exprTrimDraw(sliderName, phaseStart, phaseEnd) {
        return [
            EASE_SNIPPET,
            phaseExpr(sliderName, phaseStart, phaseEnd),
            'ez(_raw) * 100;'
        ].join('\n');
    }

    // Scale expression for dot pop-in (per-dot stagger)
    function exprDotPop(sliderName, phaseStart, phaseEnd, idx, total) {
        return [
            EASE_SNIPPET,
            phaseExpr(sliderName, phaseStart, phaseEnd),
            staggerExpr(idx, total),
            'var _s = _ep * 100;',
            '[_s, _s];'
        ].join('\n');
    }

    // Scale expression for label pop-in (per-label stagger)
    function exprLabelPop(idx, total) {
        return [
            EASE_SNIPPET,
            phaseExpr("Label Pop", 65, 95),
            staggerExpr(idx, total),
            'var _ls = C.effect("Label Scale")(1) / 100;',
            'var _s = _ep * _ls * 100;',
            '[_s, _s];'
        ].join('\n');
    }

    // Trim End for handle lines (per-line stagger)
    function exprHandleLineTrim(idx, total) {
        return [
            EASE_SNIPPET,
            phaseExpr("Handle Pop", 50, 80),
            staggerExpr(idx, total),
            '_ep * 100;'
        ].join('\n');
    }

    // Simple visibility: checkbox + global opacity, no animation dependency
    function exprVisibility(effectName) {
        return CTRL + '.effect("' + effectName + '")(1) ? ' +
               CTRL + '.effect("Global Opacity")(1) : 0;';
    }

    function exprColor(effectName) {
        return CTRL + '.effect("' + effectName + '")(1);';
    }

    // ===================================================================
    //  HELPERS
    // ===================================================================

    function makeShapeLayer(comp, name) {
        var layer = comp.layers.addShape();
        layer.name = name;
        layer.anchorPoint.setValue([0, 0]);
        layer.position.setValue([0, 0]);
        return layer;
    }

    function getVertexCompSpace(layer, pathInfo, vi) {
        var pv = pathInfo.pathProp.value;
        var localPt = pv.vertices[vi];
        var x = localPt[0], y = localPt[1];
        var chain = pathInfo.chain;
        var root = layer.property("ADBE Root Vectors Group");

        for (var ti = chain.length - 1; ti >= 0; ti--) {
            var grp = root;
            for (var tj = 0; tj <= ti; tj++) {
                grp = grp.property(chain[tj]);
            }
            var tf = grp.property("ADBE Vector Transform Group");
            if (!tf) continue;
            var ga = [0,0], gp = [0,0], gs = [100,100], gr = 0;
            try { ga = tf.property("ADBE Vector Anchor").value; } catch (e) {}
            try { gp = tf.property("ADBE Vector Position").value; } catch (e) {}
            try { gs = tf.property("ADBE Vector Scale").value; } catch (e) {}
            try { gr = tf.property("ADBE Vector Rotation").value; } catch (e) {}
            x -= ga[0]; y -= ga[1];
            x *= gs[0]/100; y *= gs[1]/100;
            var rad = gr * Math.PI / 180;
            var co = Math.cos(rad), si = Math.sin(rad);
            var nx = x * co - y * si;
            var ny = x * si + y * co;
            x = nx + gp[0]; y = ny + gp[1];
        }

        var la = layer.anchorPoint.value;
        var lp = layer.position.value;
        var ls = layer.scale.value;
        var lr = layer.rotation.value * Math.PI / 180;
        x -= la[0]; y -= la[1];
        x *= ls[0]/100; y *= ls[1]/100;
        var lc = Math.cos(lr), lsin = Math.sin(lr);
        return [x * lc - y * lsin + lp[0], x * lsin + y * lc + lp[1]];
    }

    // ===================================================================
    //  NULL CONTROLLER
    // ===================================================================

    function createController(comp) {
        var ctrl = comp.layers.addNull();
        ctrl.name = "PP_Control";
        ctrl.label = 14;
        ctrl.guideLayer = true;

        // --- Visibility ---
        var checkboxes = ["Show Anchors", "Show Handles", "Show Outlines", "Show Grid", "Show Labels"];
        for (var i = 0; i < checkboxes.length; i++) {
            var cb = ctrl.Effects.addProperty("ADBE Checkbox Control");
            cb.name = checkboxes[i];
            cb.property(1).setValue(1);
        }

        // --- Sizes ---
        var sizes = [["Anchor Size", 12], ["Handle Size", 8], ["Anchor Roundness", 0], ["Handle Roundness", 0], ["Outline Width", 3], ["Label Size", 11], ["Label Scale", 100]];
        for (var s = 0; s < sizes.length; s++) {
            var sl = ctrl.Effects.addProperty("ADBE Slider Control");
            sl.name = sizes[s][0];
            sl.property(1).setValue(sizes[s][1]);
        }

        // --- Colors ---
        var cols = [
            ["Anchor Color",  [1, 1, 1]],
            ["Handle Color",  [1, 1, 1]],
            ["Outline Color", [1, 1, 1]],
            ["Grid Color",    [1, 1, 1]],
            ["Label Color",   [1, 1, 1]]
        ];
        for (var c = 0; c < cols.length; c++) {
            var cc = ctrl.Effects.addProperty("ADBE Color Control");
            cc.name = cols[c][0];
            cc.property(1).setValue(cols[c][1]);
        }

        // --- Opacity ---
        var opacs = [["Grid Opacity", 40], ["Global Opacity", 100]];
        for (var o = 0; o < opacs.length; o++) {
            var os = ctrl.Effects.addProperty("ADBE Slider Control");
            os.name = opacs[o][0];
            os.property(1).setValue(opacs[o][1]);
        }

        // --- Animation: master ---
        var master = [["Timeline", 100], ["Stagger", 0], ["Easing", 50]];
        for (var m = 0; m < master.length; m++) {
            var ms = ctrl.Effects.addProperty("ADBE Slider Control");
            ms.name = master[m][0];
            ms.property(1).setValue(master[m][1]);
        }

        // --- Animation: per-element overrides (100 = driven by Timeline) ---
        var overrides = [["Grid Draw", 100], ["Outline Draw", 100], ["Anchor Pop", 100], ["Handle Pop", 100], ["Label Pop", 100]];
        for (var v = 0; v < overrides.length; v++) {
            var vs = ctrl.Effects.addProperty("ADBE Slider Control");
            vs.name = overrides[v][0];
            vs.property(1).setValue(overrides[v][1]);
        }

        // --- Position offsets ---
        var offsets = ["Anchors Offset", "Handles Offset", "Outlines Offset", "Labels Offset", "Grid Offset"];
        for (var p = 0; p < offsets.length; p++) {
            var pt = ctrl.Effects.addProperty("ADBE Point Control");
            pt.name = offsets[p];
            pt.property(1).setValue([0, 0]);
        }

        ctrl.moveToBeginning();
        return ctrl;
    }

    // ===================================================================
    //  LAYER BUILDERS
    // ===================================================================

    function buildAnchors(comp, pathInfos, srcLayerName) {
        var layer = makeShapeLayer(comp, "PP_Anchors");
        layer.opacity.expression = exprVisibility("Show Anchors");
        layer.position.expression = CTRL + '.effect("Anchors Offset")(1);';
        var contents = layer.property("ADBE Root Vectors Group");

        var totalDots = 0;
        for (var pi0 = 0; pi0 < pathInfos.length; pi0++) {
            totalDots += pathInfos[pi0].pathProp.value.vertices.length;
        }

        var globalIdx = 0;
        for (var pi = 0; pi < pathInfos.length; pi++) {
            var info = pathInfos[pi];
            var numVerts = info.pathProp.value.vertices.length;
            for (var vi = 0; vi < numVerts; vi++) {
                var grp = contents.addProperty("ADBE Vector Group");
                grp.name = "A" + pi + "_" + vi;
                var vectors = grp.property("ADBE Vectors Group");

                var rect = vectors.addProperty("ADBE Vector Shape - Rect");
                rect.property("ADBE Vector Rect Size").expression =
                    'var s = ' + CTRL + '.effect("Anchor Size")(1); [s,s];';
                rect.property("ADBE Vector Rect Roundness").expression =
                    CTRL + '.effect("Anchor Roundness")(1);';

                vectors.addProperty("ADBE Vector Graphic - Fill")
                    .property("ADBE Vector Fill Color").expression = exprColor("Anchor Color");

                var xf = grp.property("ADBE Vector Transform Group");
                xf.property("ADBE Vector Position")
                  .expression = exprVertexCompPos(srcLayerName, info.chain, info.pathName, vi);
                xf.property("ADBE Vector Scale")
                  .expression = exprDotPop("Anchor Pop", 30, 65, globalIdx, totalDots);

                globalIdx++;
            }
        }
        return layer;
    }

    function buildHandles(comp, pathInfos, srcLayerName) {
        var dotLayer = makeShapeLayer(comp, "PP_Handles");
        dotLayer.opacity.expression = exprVisibility("Show Handles");
        dotLayer.position.expression = CTRL + '.effect("Handles Offset")(1);';
        var dotContents = dotLayer.property("ADBE Root Vectors Group");

        var lineLayer = makeShapeLayer(comp, "PP_HandleLines");
        lineLayer.opacity.expression = exprVisibility("Show Handles");
        lineLayer.position.expression = CTRL + '.effect("Handles Offset")(1);';
        var lineContents = lineLayer.property("ADBE Root Vectors Group");

        var totalHandles = 0;
        for (var pi0 = 0; pi0 < pathInfos.length; pi0++) {
            var pv0 = pathInfos[pi0].pathProp.value;
            for (var vi0 = 0; vi0 < pv0.vertices.length; vi0++) {
                if (pv0.inTangents[vi0][0] !== 0 || pv0.inTangents[vi0][1] !== 0) totalHandles++;
                if (pv0.outTangents[vi0][0] !== 0 || pv0.outTangents[vi0][1] !== 0) totalHandles++;
            }
        }

        var handleIdx = 0;
        for (var pi = 0; pi < pathInfos.length; pi++) {
            var info = pathInfos[pi];
            var pv = info.pathProp.value;
            for (var vi = 0; vi < pv.vertices.length; vi++) {
                var inT = pv.inTangents[vi];
                var outT = pv.outTangents[vi];

                if (inT[0] !== 0 || inT[1] !== 0) {
                    var dg = dotContents.addProperty("ADBE Vector Group");
                    dg.name = "HI" + pi + "_" + vi;
                    var dv = dg.property("ADBE Vectors Group");
                    var r1 = dv.addProperty("ADBE Vector Shape - Rect");
                    r1.property("ADBE Vector Rect Size").expression =
                        'var s = ' + CTRL + '.effect("Handle Size")(1); [s,s];';
                    r1.property("ADBE Vector Rect Roundness").expression =
                        CTRL + '.effect("Handle Roundness")(1);';
                    dv.addProperty("ADBE Vector Graphic - Fill")
                      .property("ADBE Vector Fill Color").expression = exprColor("Handle Color");
                    var xf1 = dg.property("ADBE Vector Transform Group");
                    xf1.property("ADBE Vector Position")
                       .expression = exprInTangentCompPos(srcLayerName, info.chain, info.pathName, vi);
                    xf1.property("ADBE Vector Scale")
                       .expression = exprDotPop("Handle Pop", 50, 80, handleIdx, totalHandles);

                    var lg = lineContents.addProperty("ADBE Vector Group");
                    lg.name = "LI" + pi + "_" + vi;
                    var lv = lg.property("ADBE Vectors Group");
                    lv.addProperty("ADBE Vector Shape - Group")
                      .property("ADBE Vector Shape")
                      .expression = exprHandleLineCompPath(srcLayerName, info.chain, info.pathName, vi, "in");
                    var ls = lv.addProperty("ADBE Vector Graphic - Stroke");
                    ls.property("ADBE Vector Stroke Color").expression = exprColor("Handle Color");
                    ls.property("ADBE Vector Stroke Width").setValue(1.5);
                    try {
                        var ld = ls.property("ADBE Vector Stroke Dashes");
                        if (ld) {
                            var d1 = ld.addProperty("ADBE Vector Stroke Dash 1"); if (d1) d1.setValue(6);
                            var g1 = ld.addProperty("ADBE Vector Stroke Gap 1");  if (g1) g1.setValue(4);
                        }
                    } catch (e) {}
                    var trim1 = lv.addProperty("ADBE Vector Filter - Trim");
                    trim1.property("ADBE Vector Trim End").expression = exprHandleLineTrim(handleIdx, totalHandles);

                    handleIdx++;
                }

                if (outT[0] !== 0 || outT[1] !== 0) {
                    var dg2 = dotContents.addProperty("ADBE Vector Group");
                    dg2.name = "HO" + pi + "_" + vi;
                    var dv2 = dg2.property("ADBE Vectors Group");
                    var r2 = dv2.addProperty("ADBE Vector Shape - Rect");
                    r2.property("ADBE Vector Rect Size").expression =
                        'var s = ' + CTRL + '.effect("Handle Size")(1); [s,s];';
                    r2.property("ADBE Vector Rect Roundness").expression =
                        CTRL + '.effect("Handle Roundness")(1);';
                    dv2.addProperty("ADBE Vector Graphic - Fill")
                       .property("ADBE Vector Fill Color").expression = exprColor("Handle Color");
                    var xf2 = dg2.property("ADBE Vector Transform Group");
                    xf2.property("ADBE Vector Position")
                       .expression = exprOutTangentCompPos(srcLayerName, info.chain, info.pathName, vi);
                    xf2.property("ADBE Vector Scale")
                       .expression = exprDotPop("Handle Pop", 50, 80, handleIdx, totalHandles);

                    var lg2 = lineContents.addProperty("ADBE Vector Group");
                    lg2.name = "LO" + pi + "_" + vi;
                    var lv2 = lg2.property("ADBE Vectors Group");
                    lv2.addProperty("ADBE Vector Shape - Group")
                       .property("ADBE Vector Shape")
                       .expression = exprHandleLineCompPath(srcLayerName, info.chain, info.pathName, vi, "out");
                    var ls2 = lv2.addProperty("ADBE Vector Graphic - Stroke");
                    ls2.property("ADBE Vector Stroke Color").expression = exprColor("Handle Color");
                    ls2.property("ADBE Vector Stroke Width").setValue(1.5);
                    try {
                        var ld2 = ls2.property("ADBE Vector Stroke Dashes");
                        if (ld2) {
                            var d12 = ld2.addProperty("ADBE Vector Stroke Dash 1"); if (d12) d12.setValue(6);
                            var g12 = ld2.addProperty("ADBE Vector Stroke Gap 1");  if (g12) g12.setValue(4);
                        }
                    } catch (e2) {}
                    var trim2 = lv2.addProperty("ADBE Vector Filter - Trim");
                    trim2.property("ADBE Vector Trim End").expression = exprHandleLineTrim(handleIdx, totalHandles);

                    handleIdx++;
                }
            }
        }
        return [dotLayer, lineLayer];
    }

    function buildOutlines(comp, pathInfos, srcLayerName) {
        var layer = makeShapeLayer(comp, "PP_Outlines");
        layer.opacity.expression = exprVisibility("Show Outlines");
        layer.position.expression = CTRL + '.effect("Outlines Offset")(1);';
        var contents = layer.property("ADBE Root Vectors Group");

        for (var pi = 0; pi < pathInfos.length; pi++) {
            var info = pathInfos[pi];
            var pv = info.pathProp.value;
            var grp = contents.addProperty("ADBE Vector Group");
            grp.name = "O" + pi;
            var vectors = grp.property("ADBE Vectors Group");

            vectors.addProperty("ADBE Vector Shape - Group")
                   .property("ADBE Vector Shape")
                   .expression = exprOutlineCompPath(
                       srcLayerName, info.chain, info.pathName,
                       pv.vertices.length, pv.closed
                   );

            var stroke = vectors.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Color").expression = exprColor("Outline Color");
            stroke.property("ADBE Vector Stroke Width").expression =
                CTRL + '.effect("Outline Width")(1);';

            var trim = vectors.addProperty("ADBE Vector Filter - Trim");
            trim.property("ADBE Vector Trim End").expression = exprTrimDraw("Outline Draw", 10, 55);
        }
        return layer;
    }

    function buildLabels(comp, pathInfos, srcLayerName, fontName) {
        var layers = [];
        var totalLabels = 0;
        for (var pi0 = 0; pi0 < pathInfos.length; pi0++) {
            totalLabels += pathInfos[pi0].pathProp.value.vertices.length;
        }

        var globalIdx = 0;
        for (var pi = 0; pi < pathInfos.length; pi++) {
            var info = pathInfos[pi];
            var numVerts = info.pathProp.value.vertices.length;
            for (var vi = 0; vi < numVerts; vi++) {
                var tl = comp.layers.addText("(0, 0)");
                tl.name = "PP_Label_" + pi + "_" + vi;

                var tdProp = tl.property("ADBE Text Properties").property("ADBE Text Document");
                var td = tdProp.value;
                td.resetCharStyle();
                td.fontSize = 11;
                td.fillColor = [1, 1, 1];
                var cleanFont = (fontName || "ArialMT").replace(/\s/g, "");
                try { td.font = cleanFont; } catch (ef) {
                    try { td.font = "ArialMT"; } catch (ef2) {}
                }
                td.justification = ParagraphJustification.CENTER_JUSTIFY;
                tdProp.setValue(td);

                tl.anchorPoint.setValue([0, 0]);
                tl.position.expression = exprLabelPos(srcLayerName, info.chain, info.pathName, vi);
                tdProp.expression = exprLabelText(srcLayerName, info.chain, info.pathName, vi);

                tl.opacity.expression = exprVisibility("Show Labels");
                tl.scale.expression = exprLabelPop(globalIdx, totalLabels);

                layers.push(tl);
                globalIdx++;
            }
        }
        return layers;
    }

    function buildGrid(comp, pathInfos, srcLayer) {
        if (pathInfos.length === 0) return null;

        var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        var allVerts = [];
        for (var pi = 0; pi < pathInfos.length; pi++) {
            var pv = pathInfos[pi].pathProp.value;
            for (var vi = 0; vi < pv.vertices.length; vi++) {
                var cp = getVertexCompSpace(srcLayer, pathInfos[pi], vi);
                if (cp[0] < minX) minX = cp[0]; if (cp[0] > maxX) maxX = cp[0];
                if (cp[1] < minY) minY = cp[1]; if (cp[1] > maxY) maxY = cp[1];
                allVerts.push({ pi: pi, vi: vi, x: cp[0], y: cp[1] });
            }
        }

        var w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
        var diag = Math.sqrt(w*w + h*h);
        var pad = Math.max(30, diag * 0.15);
        var xMin = Math.round(minX - pad), xMax = Math.round(maxX + pad);
        var yMin = Math.round(minY - pad), yMax = Math.round(maxY + pad);

        var tol = Math.max(6, w * 0.04);
        var usedX = [], usedY = [];
        var gridXInfos = [], gridYInfos = [];
        for (var ai = 0; ai < allVerts.length; ai++) {
            var av = allVerts[ai];
            var dupX = false;
            for (var ux = 0; ux < usedX.length; ux++) {
                if (Math.abs(usedX[ux] - av.x) <= tol) { dupX = true; break; }
            }
            if (!dupX && usedX.length < 18) {
                usedX.push(av.x);
                gridXInfos.push(av);
            }
            var dupY = false;
            for (var uy = 0; uy < usedY.length; uy++) {
                if (Math.abs(usedY[uy] - av.y) <= tol) { dupY = true; break; }
            }
            if (!dupY && usedY.length < 18) {
                usedY.push(av.y);
                gridYInfos.push(av);
            }
        }

        var layer = makeShapeLayer(comp, "PP_Grid");
        layer.opacity.expression = [
            'var C = ' + CTRL + ';',
            'var show = C.effect("Show Grid")(1);',
            'var op = C.effect("Grid Opacity")(1);',
            'show ? op : 0;'
        ].join('\n');
        layer.position.expression = CTRL + '.effect("Grid Offset")(1);';
        var contents = layer.property("ADBE Root Vectors Group");
        var srcName = srcLayer.name;

        // Vertical lines
        var vGrp = contents.addProperty("ADBE Vector Group");
        vGrp.name = "V_Lines";
        var vVec = vGrp.property("ADBE Vectors Group");
        for (var gxi = 0; gxi < gridXInfos.length; gxi++) {
            var gx = gridXInfos[gxi];
            var pg = vVec.addProperty("ADBE Vector Shape - Group");
            pg.name = "VL_" + gx.pi + "_" + gx.vi;
            pg.property("ADBE Vector Shape").expression =
                exprGridVerticalComp(srcName, pathInfos[gx.pi].chain, pathInfos[gx.pi].pathName, gx.vi, yMin, yMax);
        }
        var vSt = vVec.addProperty("ADBE Vector Graphic - Stroke");
        vSt.property("ADBE Vector Stroke Color").expression = exprColor("Grid Color");
        vSt.property("ADBE Vector Stroke Width").setValue(1);
        var vTrim = vVec.addProperty("ADBE Vector Filter - Trim");
        vTrim.property("ADBE Vector Trim End").expression = exprTrimDraw("Grid Draw", 0, 30);

        // Horizontal lines
        var hGrp = contents.addProperty("ADBE Vector Group");
        hGrp.name = "H_Lines";
        var hVec = hGrp.property("ADBE Vectors Group");
        for (var gyi = 0; gyi < gridYInfos.length; gyi++) {
            var gy = gridYInfos[gyi];
            var pg2 = hVec.addProperty("ADBE Vector Shape - Group");
            pg2.name = "HL_" + gy.pi + "_" + gy.vi;
            pg2.property("ADBE Vector Shape").expression =
                exprGridHorizontalComp(srcName, pathInfos[gy.pi].chain, pathInfos[gy.pi].pathName, gy.vi, xMin, xMax);
        }
        var hSt = hVec.addProperty("ADBE Vector Graphic - Stroke");
        hSt.property("ADBE Vector Stroke Color").expression = exprColor("Grid Color");
        hSt.property("ADBE Vector Stroke Width").setValue(1);
        var hTrim = hVec.addProperty("ADBE Vector Filter - Trim");
        hTrim.property("ADBE Vector Trim End").expression = exprTrimDraw("Grid Draw", 0, 30);

        // Diagonal guides (baked static)
        var diagGuides = [];
        for (var dpi = 0; dpi < pathInfos.length; dpi++) {
            var dpv = pathInfos[dpi].pathProp.value;
            var nv = dpv.vertices.length;
            var segs = dpv.closed ? nv : (nv - 1);
            for (var si = 0; si < segs; si++) {
                var va = getVertexCompSpace(srcLayer, pathInfos[dpi], si);
                var vb = getVertexCompSpace(srcLayer, pathInfos[dpi], (si+1)%nv);
                var dx = vb[0]-va[0], dy = vb[1]-va[1];
                var segLen = Math.sqrt(dx*dx + dy*dy);
                if (segLen < 12) continue;
                var outA = dpv.outTangents[si];
                var inB = dpv.inTangents[(si+1)%nv];
                if (Math.sqrt(outA[0]*outA[0]+outA[1]*outA[1]) > segLen*0.15) continue;
                if (Math.sqrt(inB[0]*inB[0]+inB[1]*inB[1]) > segLen*0.15) continue;
                var ang = Math.atan2(dy, dx) * 180 / Math.PI;
                while (ang <= -90) ang += 180;
                while (ang > 90) ang -= 180;
                if (Math.abs(ang) < 5 || Math.abs(Math.abs(ang) - 90) < 5) continue;
                var dup2 = false;
                for (var di = 0; di < diagGuides.length; di++) {
                    if (Math.abs(diagGuides[di].a - ang) <= 4) { dup2 = true; break; }
                }
                if (!dup2 && diagGuides.length < 6) {
                    diagGuides.push({ a: ang, mx: (va[0]+vb[0])*0.5, my: (va[1]+vb[1])*0.5 });
                }
            }
        }

        if (diagGuides.length > 0) {
            var dGrp = contents.addProperty("ADBE Vector Group");
            dGrp.name = "D_Lines";
            var dVec = dGrp.property("ADBE Vectors Group");
            var halfLen = diag * 1.4;
            for (var dgi = 0; dgi < diagGuides.length; dgi++) {
                var dguide = diagGuides[dgi];
                var dRad = dguide.a * Math.PI / 180;
                var cosA = Math.cos(dRad), sinA = Math.sin(dRad);
                var dpg = dVec.addProperty("ADBE Vector Shape - Group");
                dpg.name = "DL" + dgi;
                var ds = new Shape();
                ds.vertices = [
                    [dguide.mx - cosA*halfLen, dguide.my - sinA*halfLen],
                    [dguide.mx + cosA*halfLen, dguide.my + sinA*halfLen]
                ];
                ds.inTangents = [[0,0],[0,0]];
                ds.outTangents = [[0,0],[0,0]];
                ds.closed = false;
                dpg.property("ADBE Vector Shape").setValue(ds);
            }
            var dSt = dVec.addProperty("ADBE Vector Graphic - Stroke");
            dSt.property("ADBE Vector Stroke Color").expression = exprColor("Grid Color");
            dSt.property("ADBE Vector Stroke Width").setValue(1);
            var dTrim = dVec.addProperty("ADBE Vector Filter - Trim");
            dTrim.property("ADBE Vector Trim End").expression = exprTrimDraw("Grid Draw", 0, 30);
        }

        layer.moveToEnd();
        return layer;
    }

    // ===================================================================
    //  MAIN BUILD
    // ===================================================================

    function buildAll(srcLayer, fontName) {
        var comp = getComp();
        if (!comp) { alert("No active composition."); return; }

        var pathInfos = discoverPaths(srcLayer);
        if (pathInfos.length === 0) {
            alert("No paths found in \"" + srcLayer.name + "\".");
            return;
        }

        var totalVerts = 0;
        for (var i = 0; i < pathInfos.length; i++) {
            totalVerts += pathInfos[i].pathProp.value.vertices.length;
        }
        if (totalVerts > 120) {
            if (!confirm(totalVerts + " vertices found. Expressions may slow playback. Continue?")) return;
        }

        app.beginUndoGroup("Path Plugin v3 \u2014 Build");

        try {
            var srcName = srcLayer.name;
            createController(comp);

            buildGrid(comp, pathInfos, srcLayer);
            buildOutlines(comp, pathInfos, srcName);
            buildHandles(comp, pathInfos, srcName);
            buildAnchors(comp, pathInfos, srcName);
            buildLabels(comp, pathInfos, srcName, fontName);

            app.endUndoGroup();
            alert("Path Plugin v3 built!\n" +
                  pathInfos.length + " path(s), " + totalVerts + " vertices.\n\n" +
                  "Keyframe 'Timeline' (0\u2192100) for choreographed reveal.\n" +
                  "Or use per-element sliders for individual control.");
        } catch (e) {
            app.endUndoGroup();
            var line = (e && e.line) ? (" (line " + e.line + ")") : "";
            alert("Error: " + e.toString() + line);
        }
    }

    // ===================================================================
    //  CLEANUP
    // ===================================================================

    function cleanupAll() {
        var comp = getComp();
        if (!comp) { alert("No active composition."); return; }
        app.beginUndoGroup("Path Plugin \u2014 Cleanup");
        var removed = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            if (comp.layer(i).name.indexOf("PP_") === 0) {
                comp.layer(i).remove();
                removed++;
            }
        }
        app.endUndoGroup();
        alert("Removed " + removed + " layer(s).");
    }

    // ===================================================================
    //  AUTO-ANIMATE
    // ===================================================================

    function autoAnimate(duration, stagger, easing) {
        var comp = getComp();
        if (!comp) { alert("No active composition."); return; }
        var ctrl = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === "PP_Control") { ctrl = comp.layer(i); break; }
        }
        if (!ctrl) { alert("PP_Control not found. Build visuals first."); return; }

        var dur = Math.max(parseFloat(duration) || 2, 0.1);
        var t = comp.time;

        app.beginUndoGroup("Path Plugin \u2014 Auto Animate");

        ctrl.effect("Stagger").property(1).setValue(stagger);
        ctrl.effect("Easing").property(1).setValue(easing);

        var tl = ctrl.effect("Timeline").property(1);
        tl.setValueAtTime(t, 0);
        tl.setValueAtTime(t + dur, 100);
        var k1 = tl.nearestKeyIndex(t);
        var k2 = tl.nearestKeyIndex(t + dur);
        tl.setTemporalEaseAtKey(k1, [new KeyframeEase(0, 33)], [new KeyframeEase(0, 33)]);
        tl.setTemporalEaseAtKey(k2, [new KeyframeEase(0, 33)], [new KeyframeEase(0, 33)]);

        app.endUndoGroup();
        alert("Keyframes set at " + t.toFixed(2) + "s:\n" +
              "  Timeline: 0 \u2192 100 over " + dur + "s\n" +
              "  Stagger: " + stagger + "  |  Easing: " + easing + "\n\n" +
              "The Timeline drives all phases.\n" +
              "Adjust individual overrides on PP_Control to customize.");
    }

    // ===================================================================
    //  BAKE — make PP_Outlines editable, re-link everything to it
    // ===================================================================

    function bakeOutlines() {
        var comp = getComp();
        if (!comp) { alert("No active composition."); return; }

        var outLayer = null, ctrl = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === "PP_Outlines") outLayer = comp.layer(i);
            if (comp.layer(i).name === "PP_Control") ctrl = comp.layer(i);
        }
        if (!outLayer) { alert("PP_Outlines not found. Build visuals first."); return; }
        if (!ctrl) { alert("PP_Control not found."); return; }

        app.beginUndoGroup("Path Plugin \u2014 Bake");

        outLayer.position.expression = "";
        outLayer.position.setValue([0, 0]);

        var root = outLayer.property("ADBE Root Vectors Group");
        var bakedPaths = [];

        for (var gi = 1; gi <= root.numProperties; gi++) {
            var grp = root.property(gi);
            if (grp.matchName !== "ADBE Vector Group") continue;
            var vectors = grp.property("ADBE Vectors Group");
            if (!vectors) continue;
            for (var si = 1; si <= vectors.numProperties; si++) {
                var sp = vectors.property(si);
                if (sp.matchName !== "ADBE Vector Shape - Group") continue;
                var pathProp = sp.property("ADBE Vector Shape");
                if (!pathProp) continue;

                var currentShape = pathProp.valueAtTime(comp.time, false);
                pathProp.expression = "";
                pathProp.setValue(currentShape);

                bakedPaths.push({
                    groupName: grp.name,
                    shapeName: sp.name,
                    numVerts: currentShape.vertices.length,
                    closed: currentShape.closed
                });
            }
        }

        if (bakedPaths.length === 0) {
            app.endUndoGroup();
            alert("No paths found on PP_Outlines.");
            return;
        }

        var oName = "PP_Outlines";

        function bakedVertexPos(groupName, shapeName, vi) {
            var ref = 'thisComp.layer("' + esc(oName) + '").content("' +
                      esc(groupName) + '").content("' + esc(shapeName) + '").path';
            return ref + '.points()[' + vi + '];';
        }

        function bakedInTangentPos(groupName, shapeName, vi) {
            var ref = 'thisComp.layer("' + esc(oName) + '").content("' +
                      esc(groupName) + '").content("' + esc(shapeName) + '").path';
            return [
                'var v = ' + ref + '.points()[' + vi + '];',
                'var t = ' + ref + '.inTangents()[' + vi + '];',
                '[v[0]+t[0], v[1]+t[1]];'
            ].join('\n');
        }

        function bakedOutTangentPos(groupName, shapeName, vi) {
            var ref = 'thisComp.layer("' + esc(oName) + '").content("' +
                      esc(groupName) + '").content("' + esc(shapeName) + '").path';
            return [
                'var v = ' + ref + '.points()[' + vi + '];',
                'var t = ' + ref + '.outTangents()[' + vi + '];',
                '[v[0]+t[0], v[1]+t[1]];'
            ].join('\n');
        }

        function bakedHandleLine(groupName, shapeName, vi, tanType) {
            var ref = 'thisComp.layer("' + esc(oName) + '").content("' +
                      esc(groupName) + '").content("' + esc(shapeName) + '").path';
            var tanMethod = tanType === "in" ? "inTangents" : "outTangents";
            return [
                'var v = ' + ref + '.points()[' + vi + '];',
                'var t = ' + ref + '.' + tanMethod + '()[' + vi + '];',
                'createPath([v, [v[0]+t[0], v[1]+t[1]]], [], [], false);'
            ].join('\n');
        }

        function bakedLabelText(groupName, shapeName, vi) {
            var ref = 'thisComp.layer("' + esc(oName) + '").content("' +
                      esc(groupName) + '").content("' + esc(shapeName) + '").path';
            return [
                'var cp = ' + ref + '.points()[' + vi + '];',
                '"(" + Math.round(cp[0]) + ", " + Math.round(cp[1]) + ")";'
            ].join('\n');
        }

        function bakedLabelPos(groupName, shapeName, vi) {
            var ref = 'thisComp.layer("' + esc(oName) + '").content("' +
                      esc(groupName) + '").content("' + esc(shapeName) + '").path';
            return [
                'var cp = ' + ref + '.points()[' + vi + '];',
                'var off = ' + CTRL + '.effect("Labels Offset")(1);',
                '[cp[0] + off[0], cp[1] + off[1] - 14];'
            ].join('\n');
        }

        // Re-link PP_Anchors
        var anchorLayer = null;
        for (var ai = 1; ai <= comp.numLayers; ai++) {
            if (comp.layer(ai).name === "PP_Anchors") { anchorLayer = comp.layer(ai); break; }
        }
        if (anchorLayer) {
            var aRoot = anchorLayer.property("ADBE Root Vectors Group");
            for (var bi = 0; bi < bakedPaths.length; bi++) {
                var bp = bakedPaths[bi];
                for (var vi = 0; vi < bp.numVerts; vi++) {
                    var aGrp = aRoot.property("A" + bi + "_" + vi);
                    if (aGrp) {
                        aGrp.property("ADBE Vector Transform Group")
                             .property("ADBE Vector Position")
                             .expression = bakedVertexPos(bp.groupName, bp.shapeName, vi);
                    }
                }
            }
        }

        // Re-link PP_Handles and PP_HandleLines
        var handleLayer = null, hlineLayer = null;
        for (var hi = 1; hi <= comp.numLayers; hi++) {
            if (comp.layer(hi).name === "PP_Handles") handleLayer = comp.layer(hi);
            if (comp.layer(hi).name === "PP_HandleLines") hlineLayer = comp.layer(hi);
        }

        if (handleLayer) {
            var hRoot = handleLayer.property("ADBE Root Vectors Group");
            for (var hgi = 1; hgi <= hRoot.numProperties; hgi++) {
                var hGrp = hRoot.property(hgi);
                if (!hGrp || hGrp.matchName !== "ADBE Vector Group") continue;
                var parts = hGrp.name.match(/^H([IO])(\d+)_(\d+)$/);
                if (!parts) continue;
                var tanType = parts[1] === "I" ? "in" : "out";
                var pIdx = parseInt(parts[2], 10);
                var vIdx = parseInt(parts[3], 10);
                if (pIdx < bakedPaths.length) {
                    var bpH = bakedPaths[pIdx];
                    hGrp.property("ADBE Vector Transform Group")
                         .property("ADBE Vector Position")
                         .expression = tanType === "in"
                        ? bakedInTangentPos(bpH.groupName, bpH.shapeName, vIdx)
                        : bakedOutTangentPos(bpH.groupName, bpH.shapeName, vIdx);
                }
            }
        }

        if (hlineLayer) {
            var lRoot = hlineLayer.property("ADBE Root Vectors Group");
            for (var lgi = 1; lgi <= lRoot.numProperties; lgi++) {
                var lGrp = lRoot.property(lgi);
                if (!lGrp || lGrp.matchName !== "ADBE Vector Group") continue;
                var lParts = lGrp.name.match(/^L([IO])(\d+)_(\d+)$/);
                if (!lParts) continue;
                var lTanType = lParts[1] === "I" ? "in" : "out";
                var lPIdx = parseInt(lParts[2], 10);
                var lVIdx = parseInt(lParts[3], 10);
                if (lPIdx < bakedPaths.length) {
                    var bpL = bakedPaths[lPIdx];
                    var vecGrp = lGrp.property("ADBE Vectors Group");
                    for (var vsi = 1; vsi <= vecGrp.numProperties; vsi++) {
                        var vsp = vecGrp.property(vsi);
                        if (vsp.matchName === "ADBE Vector Shape - Group") {
                            vsp.property("ADBE Vector Shape").expression =
                                bakedHandleLine(bpL.groupName, bpL.shapeName, lVIdx, lTanType);
                        }
                    }
                }
            }
        }

        // Re-link PP_Labels
        for (var li = 1; li <= comp.numLayers; li++) {
            var lyr = comp.layer(li);
            if (lyr.name.indexOf("PP_Label_") !== 0) continue;
            var lm = lyr.name.match(/^PP_Label_(\d+)_(\d+)$/);
            if (!lm) continue;
            var lbPI = parseInt(lm[1], 10);
            var lbVI = parseInt(lm[2], 10);
            if (lbPI < bakedPaths.length) {
                var bpLbl = bakedPaths[lbPI];
                lyr.position.expression = bakedLabelPos(bpLbl.groupName, bpLbl.shapeName, lbVI);
                lyr.property("ADBE Text Properties").property("ADBE Text Document")
                   .expression = bakedLabelText(bpLbl.groupName, bpLbl.shapeName, lbVI);
            }
        }

        // Re-link PP_Grid
        var gridLayer = null;
        for (var gri = 1; gri <= comp.numLayers; gri++) {
            if (comp.layer(gri).name === "PP_Grid") { gridLayer = comp.layer(gri); break; }
        }

        if (gridLayer) {
            var gMinX = 1e9, gMinY = 1e9, gMaxX = -1e9, gMaxY = -1e9;
            for (var bpi = 0; bpi < bakedPaths.length; bpi++) {
                var oGrp = root.property(bakedPaths[bpi].groupName);
                if (!oGrp) continue;
                var oVec = oGrp.property("ADBE Vectors Group");
                if (!oVec) continue;
                for (var osi = 1; osi <= oVec.numProperties; osi++) {
                    var oSp = oVec.property(osi);
                    if (oSp.matchName !== "ADBE Vector Shape - Group") continue;
                    var oPath = oSp.property("ADBE Vector Shape").value;
                    for (var ovi = 0; ovi < oPath.vertices.length; ovi++) {
                        var ov = oPath.vertices[ovi];
                        if (ov[0] < gMinX) gMinX = ov[0];
                        if (ov[0] > gMaxX) gMaxX = ov[0];
                        if (ov[1] < gMinY) gMinY = ov[1];
                        if (ov[1] > gMaxY) gMaxY = ov[1];
                    }
                }
            }
            var gw = Math.max(1, gMaxX - gMinX), gh = Math.max(1, gMaxY - gMinY);
            var gDiag = Math.sqrt(gw*gw + gh*gh);
            var gPad = Math.max(30, gDiag * 0.15);
            var gxMin = Math.round(gMinX - gPad), gxMax = Math.round(gMaxX + gPad);
            var gyMin = Math.round(gMinY - gPad), gyMax = Math.round(gMaxY + gPad);

            var gRoot = gridLayer.property("ADBE Root Vectors Group");
            for (var gg = 1; gg <= gRoot.numProperties; gg++) {
                var gridGrp = gRoot.property(gg);
                if (!gridGrp || gridGrp.matchName !== "ADBE Vector Group") continue;
                var gVecG = gridGrp.property("ADBE Vectors Group");
                if (!gVecG) continue;
                for (var gs = 1; gs <= gVecG.numProperties; gs++) {
                    var gsp = gVecG.property(gs);
                    if (gsp.matchName !== "ADBE Vector Shape - Group") continue;
                    var vlm = gsp.name.match(/^VL_(\d+)_(\d+)$/);
                    var hlm = gsp.name.match(/^HL_(\d+)_(\d+)$/);

                    if (vlm) {
                        var vpi = parseInt(vlm[1], 10);
                        var vvi = parseInt(vlm[2], 10);
                        if (vpi < bakedPaths.length) {
                            var vbp = bakedPaths[vpi];
                            var vRef = 'thisComp.layer("' + esc(oName) + '").content("' +
                                       esc(vbp.groupName) + '").content("' + esc(vbp.shapeName) + '").path';
                            gsp.property("ADBE Vector Shape").expression = [
                                'var cp = ' + vRef + '.points()[' + vvi + '];',
                                'createPath([[cp[0],' + gyMin + '],[cp[0],' + gyMax + ']], [], [], false);'
                            ].join('\n');
                        }
                    } else if (hlm) {
                        var hpi = parseInt(hlm[1], 10);
                        var hvi = parseInt(hlm[2], 10);
                        if (hpi < bakedPaths.length) {
                            var hbp = bakedPaths[hpi];
                            var hRef = 'thisComp.layer("' + esc(oName) + '").content("' +
                                       esc(hbp.groupName) + '").content("' + esc(hbp.shapeName) + '").path';
                            gsp.property("ADBE Vector Shape").expression = [
                                'var cp = ' + hRef + '.points()[' + hvi + '];',
                                'createPath([[' + gxMin + ',cp[1]],[' + gxMax + ',cp[1]]], [], [], false);'
                            ].join('\n');
                        }
                    } else {
                        var gPathProp = gsp.property("ADBE Vector Shape");
                        if (gPathProp && gPathProp.expressionEnabled) {
                            var gShape = gPathProp.valueAtTime(comp.time, false);
                            gPathProp.expression = "";
                            gPathProp.setValue(gShape);
                        }
                    }
                }
            }
        }

        app.endUndoGroup();
        alert("Baked!\n\n" +
              "PP_Outlines is now editable with the pen tool.\n" +
              "Anchors, handles, labels, and grid lines\n" +
              "are all re-linked to follow PP_Outlines.\n\n" +
              "Move a point and everything follows \u2014 including the grid.");
    }

    // ===================================================================
    //  UI
    // ===================================================================

    var win = new Window("palette", "Path Plugin v3", undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 6;
    win.margins = [14, 14, 14, 14];
    win.preferredSize = [360, -1];

    // --- Header ---
    var hdr = win.add("group");
    hdr.alignment = ["fill", "center"];
    var titleTxt = hdr.add("statictext", undefined, "PATH PLUGIN");
    titleTxt.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);
    hdr.add("statictext", undefined, "");
    var verTxt = hdr.add("statictext", undefined, "v3.0");
    try {
        verTxt.graphics.foregroundColor = verTxt.graphics.newPen(
            verTxt.graphics.PenType.SOLID_COLOR, [0.55, 0.55, 0.55, 1], 1
        );
    } catch (e) {}

    // --- Source panel ---
    var srcPanel = win.add("panel", undefined, "Source Layer");
    srcPanel.alignChildren = ["fill", "top"];
    srcPanel.margins = [10, 18, 10, 10];
    var srcRow = srcPanel.add("group");
    srcRow.alignment = ["fill", "top"];
    var srcDrop = srcRow.add("dropdownlist", undefined, []);
    srcDrop.alignment = ["fill", "center"];
    srcDrop.preferredSize = [240, 24];
    var srcRefresh = srcRow.add("button", undefined, "\u21BB");
    srcRefresh.preferredSize = [30, 24];
    srcRefresh.helpTip = "Refresh layer list";

    function refreshSourceList() {
        srcDrop.removeAll();
        var comp = getComp();
        if (!comp) return;
        var shapes = getShapeLayers(comp);
        for (var i = 0; i < shapes.length; i++) {
            srcDrop.add("item", shapes[i].name);
        }
        if (srcDrop.items.length > 0) srcDrop.selection = 0;
    }
    srcRefresh.onClick = refreshSourceList;
    refreshSourceList();

    // --- Settings panel ---
    var setPanel = win.add("panel", undefined, "Settings");
    setPanel.alignChildren = ["fill", "top"];
    setPanel.margins = [10, 18, 10, 10];
    setPanel.spacing = 4;

    var fontRow = setPanel.add("group");
    fontRow.alignment = ["fill", "top"];
    fontRow.add("statictext", undefined, "Font:");
    var fontInput = fontRow.add("edittext", undefined, "ArialMT");
    fontInput.alignment = ["fill", "center"];
    fontInput.preferredSize = [200, 24];
    fontInput.helpTip = "PostScript font name (no spaces, auto-stripped).\nExamples: ArialMT, FuturaMedium, HelveticaBold";

    // --- Build panel ---
    var actPanel = win.add("panel", undefined, "Build");
    actPanel.alignChildren = ["fill", "top"];
    actPanel.margins = [10, 18, 10, 10];
    actPanel.spacing = 5;
    var btnBuild = actPanel.add("button", undefined, "BUILD VISUALS");
    btnBuild.preferredSize = [-1, 32];
    btnBuild.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    var utilRow = actPanel.add("group");
    utilRow.alignment = ["fill", "top"];
    var btnCleanup = utilRow.add("button", undefined, "Cleanup All");
    btnCleanup.alignment = ["fill", "center"];
    var btnPrecomp = utilRow.add("button", undefined, "Precomp");
    btnPrecomp.alignment = ["fill", "center"];
    var btnBake = actPanel.add("button", undefined, "BAKE \u2014 Make Outlines Editable");
    btnBake.preferredSize = [-1, 28];
    btnBake.helpTip = "Freezes outline expressions, re-links all visuals to PP_Outlines for pen-tool editing.";

    // --- Animation panel ---
    var animPanel = win.add("panel", undefined, "Animation");
    animPanel.alignChildren = ["fill", "top"];
    animPanel.margins = [10, 18, 10, 10];
    animPanel.spacing = 4;

    var durRow = animPanel.add("group");
    durRow.alignment = ["fill", "top"];
    durRow.add("statictext", undefined, "Duration (s):");
    var durInput = durRow.add("edittext", undefined, "2");
    durInput.preferredSize = [44, 24];

    var stgRow = animPanel.add("group");
    stgRow.alignment = ["fill", "top"];
    stgRow.add("statictext", undefined, "Stagger:");
    var stgInput = stgRow.add("edittext", undefined, "40");
    stgInput.preferredSize = [44, 24];
    stgInput.helpTip = "0 = all together, 100 = fully sequential";

    var easeRow = animPanel.add("group");
    easeRow.alignment = ["fill", "top"];
    easeRow.add("statictext", undefined, "Easing:");
    var easeInput = easeRow.add("edittext", undefined, "50");
    easeInput.preferredSize = [44, 24];
    easeInput.helpTip = "0 = linear, 50 = smooth, 100 = snappy punch";

    var btnAutoAnim = animPanel.add("button", undefined, "AUTO-ANIMATE");
    btnAutoAnim.preferredSize = [-1, 28];
    btnAutoAnim.graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    btnAutoAnim.helpTip = "Keyframes Timeline 0\u2192100 at current time with chosen duration, stagger, easing.";

    var btnResetAnim = animPanel.add("button", undefined, "Reset Animation");
    btnResetAnim.preferredSize = [-1, 24];
    btnResetAnim.helpTip = "Removes all keyframes, resets Timeline to 100 (fully visible).";

    // --- Info panel ---
    var notePanel = win.add("panel", undefined, "How It Works");
    notePanel.alignChildren = ["fill", "top"];
    notePanel.margins = [10, 18, 10, 8];
    notePanel.add("statictext", undefined,
        "Construction-style animation \u2014 no opacity fades.\n\n" +
        "PP_Control null sliders:\n" +
        "  Timeline (0\u2192100): master choreography\n" +
        "    Grid draws on \u2192 Outlines draw on \u2192\n" +
        "    Anchors pop \u2192 Handles pop \u2192 Labels pop\n\n" +
        "  Per-element overrides (0\u2192100):\n" +
        "    Grid Draw, Outline Draw, Anchor Pop,\n" +
        "    Handle Pop, Label Pop\n\n" +
        "  Easing: controls ease-out curve shape\n" +
        "  Stagger: sequential reveal within groups\n\n" +
        "  BAKE: pen-tool edit outlines, visuals follow.",
        { multiline: true }
    ).preferredSize = [-1, 185];

    // ===================================================================
    //  BUTTON HANDLERS
    // ===================================================================

    btnBuild.onClick = function () {
        var comp = getComp();
        if (!comp) { alert("No active composition."); return; }
        if (!srcDrop.selection) { alert("Select a source shape layer."); return; }
        var layerName = srcDrop.selection.text;
        var srcLayer = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === layerName && comp.layer(i) instanceof ShapeLayer) {
                srcLayer = comp.layer(i);
                break;
            }
        }
        if (!srcLayer) { alert("Layer \"" + layerName + "\" not found."); return; }
        for (var j = comp.numLayers; j >= 1; j--) {
            if (comp.layer(j).name.indexOf("PP_") === 0) comp.layer(j).remove();
        }
        buildAll(srcLayer, fontInput.text);
    };

    btnCleanup.onClick = cleanupAll;
    btnBake.onClick = bakeOutlines;

    btnPrecomp.onClick = function () {
        var comp = getComp();
        if (!comp) { alert("No active composition."); return; }
        app.beginUndoGroup("Path Plugin \u2014 Precomp");
        var indices = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name.indexOf("PP_") === 0) indices.push(i);
        }
        if (indices.length === 0) { app.endUndoGroup(); alert("Nothing to precomp."); return; }
        comp.layers.precompose(indices, "Path Plugin Visuals", true);
        app.endUndoGroup();
        alert("Grouped " + indices.length + " layer(s) into precomp.");
    };

    btnAutoAnim.onClick = function () {
        var stgVal = parseFloat(stgInput.text);
        if (isNaN(stgVal)) stgVal = 40;
        stgVal = Math.max(0, Math.min(100, stgVal));

        var easeVal = parseFloat(easeInput.text);
        if (isNaN(easeVal)) easeVal = 50;
        easeVal = Math.max(0, Math.min(100, easeVal));

        autoAnimate(durInput.text, stgVal, easeVal);
    };

    btnResetAnim.onClick = function () {
        var comp = getComp();
        if (!comp) { alert("No active composition."); return; }
        var ctrl = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === "PP_Control") { ctrl = comp.layer(i); break; }
        }
        if (!ctrl) { alert("PP_Control not found."); return; }

        app.beginUndoGroup("Path Plugin \u2014 Reset Animation");
        var resets = [
            ["Timeline", 100], ["Stagger", 0], ["Easing", 50],
            ["Grid Draw", 100], ["Outline Draw", 100], ["Anchor Pop", 100],
            ["Handle Pop", 100], ["Label Pop", 100]
        ];
        for (var p = 0; p < resets.length; p++) {
            var prop = ctrl.effect(resets[p][0]).property(1);
            while (prop.numKeys > 0) prop.removeKey(1);
            prop.setValue(resets[p][1]);
        }
        app.endUndoGroup();
        alert("Animation reset. All elements fully visible.");
    };

    win.onResizing = win.onResize = function () { this.layout.resize(); };
    win.center();
    win.show();

})();
