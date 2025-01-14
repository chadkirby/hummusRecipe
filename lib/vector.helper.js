const xObjectForm = require('./xObjectForm');

exports._getPathOptions = function _getPathOptions(options = {}, originX, originY) {
    const colorspace = options.colorspace || this.options.colorspace;
    const colorName = options.colorName;
    const defaultFont = this.writer.getFontForFile(this.fonts['helvetica']);

    const pathOptions = {
        originX,
        originY,
        font: defaultFont,
        fonts: {
            bold: this.writer.getFontForFile(this.fonts['helvetica-bold']),
            regular: defaultFont,
            italic: this.writer.getFontForFile(this.fonts['helvetica-italic']),
            boldItalic: this.writer.getFontForFile(this.fonts['helvetica-bold-italic'])
        },
        size: 14,
        underline: false,
        color: this._transformColor(options.color, {colorspace:colorspace, colorName:options.colorName}),
        colorspace,
        colorName,
        colorArray: [],
        width: 2,
        align: options.align
    };
    if (options.font) {
        const matchedFont = this.fonts[options.font.toLowerCase()];
        if (matchedFont) {
            pathOptions.font = this.writer.getFontForFile(matchedFont);
        }
    }
    if (options.opacity == void(0) || isNaN(options.opacity)) {
        options.opacity = 1;
    } else {
        options.opacity = (options.opacity < 0) ? 0 :
            (options.opacity > 1) ? 1 : options.opacity;
    }
    pathOptions.opacity = options.opacity;
    const extGStates = this._createExtGStates(options.opacity);
    pathOptions.strokeGsId = extGStates.stroke;
    pathOptions.fillGsId = extGStates.fill;

    if (options.size || options.fontSize) {
        const size = options.size || options.fontSize;
        if (!isNaN(size)) {
            pathOptions.size = (size <= 0) ? 1 : size;
        }
    }
    if (options.width || options.lineWidth) {
        const width = options.width || options.lineWidth;
        if (!isNaN(width)) {
            pathOptions.width = (width <= 0) ? 1 : width;
        }
    }

    const colorOpts = {colorspace:colorspace, wantColorModel:true, colorName: options.colorName};

    if (options.stroke) {
        pathOptions.strokeModel = this._transformColor(options.stroke, colorOpts);
        pathOptions.stroke = pathOptions.strokeModel.color;
    }

    if (options.fill) {
        pathOptions.fillModel = this._transformColor(options.fill, colorOpts);
        pathOptions.fill = pathOptions.fillModel.color;
    }

    pathOptions.colorModel = this._transformColor((options.color || options.colour), colorOpts);
    pathOptions.color = pathOptions.colorModel.color;
    pathOptions.colorspace = pathOptions.colorModel.colorspace;

    // rotation
    if (options.rotation !== void(0)) {
        const rotation = parseFloat(options.rotation);
        pathOptions.rotation = rotation;
        pathOptions.rotationOrigin = options.rotationOrigin || null;
    }

    // skew
    if (options.skewX !== void(0)) {
        pathOptions.skewX = options.skewX;
    }

    if (options.skewY != void(0)) {
        pathOptions.skewY = options.skewY;
    }

    // Page 127
    pathOptions.dash = (Array.isArray(options.dash)) ? options.dash : [];
    pathOptions.dashPhase = (!isNaN(options.dashPhase)) ? options.dashPhase : 0;
    if (pathOptions.dash[0] == 0 && pathOptions.dash[1] == 0) {
        pathOptions.dash = [];
        pathOptions.dashPhase = 0;
    }
    return pathOptions;
};

exports._getDistance = function _getDistance(coordA, coordB) {
    const disX = Math.abs(coordB[0] - coordA[0]);
    const disY = Math.abs(coordB[1] - coordB[1]);
    const distance = Math.sqrt(((disX * disX) + (disY * disY)));

    return distance;
};

exports._getTransformParams = getTransformParams;

function getTransformParams(inAngle, x, y, offsetX, offsetY) {
    const theta = toRadians(inAngle);
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const nx = (cosTheta * -offsetX) + (sinTheta * -offsetY);
    const ny = (cosTheta * -offsetY) - (sinTheta * -offsetX);
    return [cosTheta, -sinTheta, sinTheta, cosTheta, x - nx, y - ny];
}

exports._setRotationContext = function _setRotationTransform(context, x, y, options) {
    const deltaY = (options.deltaY) ? options.deltaY : 0;

    if (options.rotation === undefined || options.rotation === 0) {
        context.cm(1, 0, 0, 1, x, y-deltaY); // no rotation
    } else {
        let rotationOrigin;

        // override default rotation origin?
        if (!options.useGivenCoords && options.rotationOrigin &&
            Array.isArray(options.rotationOrigin) && options.rotationOrigin.length === 2) {
            const orig = this._calibrateCoordinate(options.rotationOrigin[0], options.rotationOrigin[1]);
            rotationOrigin = [orig.nx, orig.ny];
        } else {
            rotationOrigin = [options.originX, options.originY];
        }

        const rm = getTransformParams( // rotation matrix
            options.rotation, rotationOrigin[0], rotationOrigin[1],
            x - rotationOrigin[0], y - rotationOrigin[1] - deltaY
        );

        context.cm(rm[0], rm[1], rm[2], rm[3], rm[4], rm[5]);
    }
};

function toRadians(angle) {
    return 2 * Math.PI * ((angle % 360) / 360);
}

function getSkewTransform(skewXAngle= 0 , skewYAngle = 0) {
    const alpha = toRadians(skewXAngle);
    const beta  = toRadians(skewYAngle);
    const tanAlpha = Math.tan(alpha);
    const tanBeta  = Math.tan(beta);

    return [1, tanAlpha, tanBeta, 1, 0, 0];
}

exports._setSkewContext = function _setSkewTransform(context, options) {
    if (options.skewX || options.skewY) {
        const sm = getSkewTransform(options.skewX, options.skewY);

        context.cm(sm[0], sm[1], sm[2], sm[3], sm[4], sm[5]);
    }
};

exports._setScalingTransform = function _setScalingTransform(context, options) {
    if (options.ratio) {
        context.cm(options.ratio[0], 0, 0, options.ratio[1], 0, 0);
    }
};

exports._drawObject = function _drawObject(self, x, y, width, height, options, callback) {

    let xObject = options.xObject;  // allows caller to supply existing form object

    if (!xObject) {
        self.pauseContext();

        xObject = new xObjectForm(self.writer, width, height);
        const xObjectCtx = xObject.getContentContext();

        xObjectCtx.q();
        callback(xObjectCtx, xObject);
        xObjectCtx.Q();
        xObject.end();

        self.resumeContext();
    }

    const context = self.pageContext;
    context.q();
    self._setRotationContext(context, x, y, options);
    self._setSkewContext(context, options);
    self._setScalingTransform(context, options);
    context
        .doXObject(xObject)
        .Q();
};
