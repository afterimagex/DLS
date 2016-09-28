
function SchemaController($scope, $rootScope, $window, $element, $timeout, networkDataService, networkLayerService, coreService, appConfig) {
    const state = {
        DEFAULT: 0,
        SELECTION: 1,
        MOVING: 2,
        JOINING: 3,
        DRAGGING: 4,
        SHIFT: 5
    };

    const events = {
        ADD_NODE: 'graph:addNode',
        REMOVE_NODE: 'graph:removeNode',
        ADD_LINK: 'graph:addLink',
        REMOVE_LINK: 'graph:removeLink',
        REMOVE_ITEMS: 'graph:removeItems',
        CHANGED_VIEWS: 'graph:changedViews',
        ACTIVATE_ITEM: 'graph:activateItem'
    };

    var self = this;
    var viewX = 0;
    var viewY = 0;
    var schema = new Schema();

    self.$onInit = function() {
        self.counterNodesInit = 0;
        self.scale = 1.0;
        self.viewWidth = 0;
        self.viewHeight = 0;
		var divSvg = document.getElementById('workspace');
        viewBox(viewX, viewY, divSvg.offsetWidth, divSvg.offsetHeight);

        self.mouseMode = state.DEFAULT;
        self.links = schema.getLinks();
        self.nodes = schema.getNodes();

        self.activelink = {
            nodes: []
        };
        self.selRect = null;
        schemaEvents();
        initBackground(self, $scope, appConfig.svgDefinitions.gridStep, $element);
	};

	$scope.controlItem.viewportPos = function(x, y) {
	    $scope.$apply( function() {
            viewX = x;
            viewY = y;
            viewBox(viewX, viewY, self.viewWidth, self.viewHeight);
        });
	};

	$scope.controlItem.getScale = function() {
	    return getScale();
	};

	$scope.controlItem.scale = function(scale) {
        setScale(scale);
  	};

    $scope.controlItem.addLayer = function(layer) {
        var node = schema.addNode(layer.name, layer.category, layer.template, layer.id);
        if (!node)
            return false;
		node.position(layer.pos.x, layer.pos.y, appConfig.svgDefinitions.gridStep);

        return true;
    };

    $scope.controlItem.setLayers = function(layers) {

        schema.clear();
        for (let a = 0; a < layers.length; a ++) {
            if(!$scope.controlItem.addLayer(layers[a]))
                return false;
        }

        $timeout(function(){
            for (let a = 0; a < layers.length; a ++) {
                if (layers[a].wires && layers[a].wires.length > 0)
                    layers[a].wires.forEach(function(layerId, i, array){
                        schema.addLink(schema.getNodeById(layers[a].id), schema.getNodeById(layerId));
                    });
            }
        }, 400);

        return true;
    };

    $scope.controlItem.getNodes = function() {
        return schema.getSchema();
    };

    $scope.controlItem.reset = function() {
        var rect = schema.rect();
        if (rect) {
            var sc = Math.min(self.viewWidth / rect.width(), self.viewHeight / rect.height());
            setScale(sc);
            viewBox(rect.x() * sc, rect.y() * sc, self.viewWidth, self.viewHeight);
        }
    };

    function addNode(name, category, template, pos) {
        var node = schema.addNode(name, category, template);
        if (!node)
            return false;

        node.position(pos.x, pos.y, appConfig.svgDefinitions.gridStep);
        self.emitEvent(events.ADD_NODE, node);
        return true;
    }

	function addLink(nodeFrom, nodeTo) {
		schema.addLink(nodeFrom, nodeTo);
		self.emitEvent(events.ADD_LINK, {});
	}

	function clearScene() {
		schema.clear();
	}

    self.emitEvent = function(eventType, data) {
        $scope.$emit(eventType, data);
    };

    function schemaEvents() {
        self.isItemClicked = false;

		var prevMousePos = [0,0];
		var editedNode = {};
		var parentNode = angular.element($element[0].parentNode);

		var positionDrag = {x:0, y: 0};
		var activeItem = {};

        // Custom events:

		$rootScope.$on('palette_drag_start', function (event, data) {
			self.mouseMode = state.DRAGGING;
		});

		$rootScope.$on('palette_drag_end', function (event, data) {
			if (self.mouseMode === state.DRAGGING && positionDrag) {
				var pos = convertCoordinateFromClienToSvg($element, parentNode, positionDrag);
				positionDrag = false;
				var correctPos = { x: (pos.x + (viewX ) - data.offset.x) / self.scale, y: (pos.y + (viewY) - data.offset.y) / self.scale};
				if (correctPos.x > 0 && correctPos.y > 0) {
					$scope.$apply( function() {
						addNode(data.data.name, data.data.category, data.data.template, correctPos)
					});
				}
			}
		});

		$scope.$on('nodeMouseDown', function (event, data) {
		    self.mouseMode = state.MOVING;
			editedNode = schema.getNodeById(data.id);
			prevMousePos = getOffsetPos($element, data.event);
		});

		$scope.$on('nodeMouseUp', function (event, data) {

			if (self.mouseMode === state.MOVING) {

				var curMousePos = getOffsetPos($element, data);
                $scope.$apply( function() {
                    editedNode.move(
                        (curMousePos.x - prevMousePos.x) / self.scale,
                        (curMousePos.y - prevMousePos.y) / self.scale,
                        appConfig.svgDefinitions.gridStep
                    );
                });

                prevMousePos = curMousePos;
			} else if (self.mouseMode === state.JOINING) {
				removeActiveLink();
			}
            self.mouseMode = state.DEFAULT;
		});

		$scope.$on('portOutMouseDown', function (event, data) {
			var node = schema.getNodeById(data.id);
			self.mouseMode = state.JOINING;
			self.activelink.nodes.length = 0;
			self.activelink.nodes.push(node);
		});

		$scope.$on('portOutMouseUp', function (event, data) {
			if (self.mouseMode === state.JOINING) {
				removeActiveLink();
			}
            self.mouseMode = state.DEFAULT;
		});

		$scope.$on('portInMouseUp', function (event, data) {
			if (self.mouseMode === state.JOINING) {
				var nodeFrom = schema.getNodeById(self.activelink.nodes[0].id);
				var nodeTo = schema.getNodeById(data.id);

                $scope.$apply( function() {
                    addLink(nodeFrom, nodeTo);
                });
                removeActiveLink();
			}
            self.mouseMode = state.DEFAULT;
		});

		$scope.$on('selectedItem', function (event, data) {
			self.isItemClicked = true;
			$scope.$apply( function() {
                if (activeItem && activeItem.id === data.id) {
                    activeItem.isActive = !activeItem.isActive;
                    if (activeItem.isActive)
                        self.emitEvent(events.ACTIVATE_ITEM, activeItem);
                } else {
                    activeItem.isActive = false;
                    activeItem = schema.getItemById(data.id, data.type);
                    activeItem.isActive = true;
                    self.emitEvent(events.ACTIVATE_ITEM, activeItem);
                }
            });
		});

		//Mouse events:

		$element.on('dragover', function (event) {
			if (self.mouseMode === state.DRAGGING) {
				positionDrag = {x: event.clientX, y: event.clientY};
			}
		});

		$element.on('click', function (event) {

		});

		angular.element(window).on('resize', function () {
            $scope.$apply( function() {
                var divSvg = document.getElementById('workspace');
                viewBox(viewX, viewY, divSvg.offsetWidth, divSvg.offsetHeight);
            });

		});

		$element.on('mousedown', function (event) {
			if (self.mouseMode === state.DEFAULT) {

			    // if (!self.isItemClicked) {
                    $scope.$apply( function() {
                        selectItems (self.nodes, false);
                        selectItems (self.links, false);
                    });
                    activeItem.isActive = false;
                    activeItem = -1;
                // }
                // self.isItemClicked = false;

                if (event.buttons === 1 && event.ctrlKey) {

					prevMousePos = getOffsetPos($element, event);
                    prevMousePos.x += viewX;
                    prevMousePos.y += viewY;

					$scope.$apply( function() {
						self.selRect = Rect(prevMousePos.x, prevMousePos.y, prevMousePos.x, prevMousePos.y);
						self.selRect.isShown = true;
					});
					self.mouseMode = state.SELECTION;
				} else if (event.buttons === 1) {
					prevMousePos = getOffsetPos($element, event);
					self.mouseMode = state.SHIFT;
				}
		    }
		});

		$element.on('mousemove', function (event) {
            if (self.mouseMode === state.SELECTION) {
			    let curMousePos = getOffsetPos($element, event);
			    $scope.$apply( function() {
                    curMousePos.x += viewX;
                    curMousePos.y += viewY;
                    self.selRect = Rect(prevMousePos.x, prevMousePos.y, curMousePos.x, curMousePos.y);
                    self.selRect.isShown = true;
                });

		    } else if (self.mouseMode === state.SHIFT) {
		    	let curMousePos = getOffsetPos($element, event);
		    	var left = viewX -(curMousePos.x - prevMousePos.x);
		    	var top = viewY - (curMousePos.y - prevMousePos.y);

		    	viewBox(left, top, self.viewWidth, self.viewHeight);
		    	prevMousePos = curMousePos;

		    } else if (self.mouseMode === state.MOVING && event.buttons === 1) {
				let curMousePos = getOffsetPos($element, event);
				$scope.$apply( function() {
                    editedNode.move((curMousePos.x - prevMousePos.x) / self.scale, (curMousePos.y - prevMousePos.y) / self.scale);
                });
				prevMousePos = curMousePos;
			} else if (self.mouseMode === state.JOINING  && event.buttons === 1) {
				let curMousePos = getOffsetPos($element, event);
				curMousePos.x =  (viewX + curMousePos.x) / self.scale;
				curMousePos.y =  (viewY + curMousePos.y) / self.scale;
				$scope.$apply( function() {
					if (self.activelink.nodes.length === 1) {
						self.activelink.nodes.push({
							id: 'activePoint',
							pos: curMousePos
						});
					} else {
						self.activelink.nodes[1].pos = curMousePos;
					}
				});
			}
		});

		$element.on('mouseup', function () {
		    if (self.mouseMode === state.SELECTION) {
			    $scope.$apply( function() {
                    schema.selectNodesInsideRect(self.selRect.scale(1 / self.scale));
                    self.selRect = Rect(0,0,0,0);
                    self.selRect.isShown = false;
                });

		    } else if (self.mouseMode === state.JOINING) {
				removeActiveLink();
			}
            self.mouseMode = state.DEFAULT;
		});

		$element.on('mouseleave', function () {

		    if (self.mouseMode === state.DEFAULT) {

		    } else if (self.mouseMode === state.MOVING) {

            } else if (self.mouseMode === state.SELECTION) {
                $scope.$apply( function() {
			        self.selRect = Rect(0,0,0,0);
                    self.selRect.isShown = false;
                });
            } else if (self.mouseMode === state.JOINING) {
                removeActiveLink();
            }

            self.mouseMode = state.DEFAULT;
		});

        // keyboard events:

		parentNode.on('keydown', function (event) {
			if (event.keyCode === 46) {
				$scope.$apply( function() {
					if (activeItem && activeItem.isActive) {
					    if (schema.removeItem(activeItem.id, activeItem.type)) {
                            if (activeItem.type === 'node') {
                                self.emitEvent(events.REMOVE_NODE, activeItem);
                            } else if (activeItem.type === 'link') {
                                self.emitEvent(events.REMOVE_LINK, activeItem);
                            }
					    }
						activeItem = -1;
					} else {
                        var rem = schema.removeSelectedItems();
						if (rem)
                			self.emitEvent(events.REMOVE_ITEMS, rem);
                	}
           		});
			}
		});


		$element.on('wheel', function (event) {
			var delta = (event.deltaY || event.detail || event.wheelDelta) / 8;
			var scale = self.scale;
			if (delta > 0) {
				scale /= appConfig.svgDefinitions.scaleFactor;
				if (scale > appConfig.svgDefinitions.scaleMax) {
					scale = appConfig.svgDefinitions.scaleMax;
				}
			}
      		else {
      			scale *= appConfig.svgDefinitions.scaleFactor;
				if (scale < appConfig.svgDefinitions.scaleMin) {
					scale = appConfig.svgDefinitions.scaleMin;
				}
      		}
      		$scope.$apply( function() {
				var mousePos = getOffsetPos($element, event);
      			var sc = scaleToPoint(scale, mousePos);
                coreService.param('scale', sc);
                self.scale = sc;
      		});
		});

        // system events:
		$element.on('focus', function (event) {

		});
    }

    function setScale(scale) {
        scale = scaleToPoint(scale);
        coreService.param('scale', scale);
        self.scale = scale;
	}

	function getScale() {
		return self.scale;
	}

    function removeActiveLink() {
        $scope.$apply( function() {
            self.activelink.nodes.length = 0;
        });
    }

    function scaleToPoint(scale, point) {
    	var divSvg = document.getElementById('workspace');
		var sceneWidth = scale * $scope.svgWidth;
		var sceneHeight = scale * $scope.svgHeight;
        var view = Rect(0, 0, sceneWidth, sceneHeight);

        if (arguments.length < 2) {
            point = {};
            point.x = divSvg.offsetWidth / 2;
            point.y = divSvg.offsetHeight / 2;
        }

        fitRectToRect(view, Rect(0, 0, divSvg.offsetWidth, divSvg.offsetHeight));

		self.width = view.width();
		self.height = view.height();

        scale = view.width() / $scope.svgWidth;

		var scalePrev = self.scale;

		var XPrev = (viewX + point.x) / scalePrev;
		var YPrev = (viewY + point.y) / scalePrev;

		var left = (XPrev - point.x / scale) * scale;
		var top =  (YPrev - point.y / scale) * scale;

		viewBox(left, top, divSvg.offsetWidth, divSvg.offsetHeight);
        return scale;
    }

    function viewBox(x, y, width, height) {

        if ((x + width) > self.width) {
            x = self.width - width;
        }
        if ((y + height) > self.height) {
            y = self.height - height;
        }

		if (x < 0)
		    x = 0;
        if (y < 0)
            y = 0;

    	viewX = x;
    	viewY = y;
    	self.viewWidth = width;
    	self.viewHeight = height;

        self.emitEvent(events.CHANGED_VIEWS, {x: viewX, y: viewY});
        $element.attr('viewBox', viewX + ' ' + viewY + ' ' + self.viewWidth + ' ' + self.viewHeight);
    }

    function fitRectToRect(inner, outer) {
		if (inner.x() < outer.x())
			inner.x(outer.x());
		if (inner.y() < outer.y())
			inner.y(outer.y());

		if (inner.right() < outer.width() && inner.bottom() < outer.height()) {
            var ratioInner = inner.width() / inner.height();
            var ratioOuter = outer.width() / outer.height();
            if (ratioInner > ratioOuter) {
                inner.right(outer.width());
                inner.bottom(outer.width() / ratioInner);
            } else {
                inner.bottom(outer.height());
                inner.right(outer.height() * ratioInner);
            }
        }

	}
}

function initBackground(self, scope, step, element) {
    self.grid = {};
    self.grid.vertical = [];
    self.grid.horizontal = [];
    // var viewGroup = angular.element(element[0].querySelector('#view'));
    // var line = angular.element('<line>');
    for (let a = 0; a < scope.svgWidth; a += step) {
        self.grid.vertical.push({
            x: a,
            y: 0,
            x2: a,
            y2: scope.svgHeight,
        });


       /* var curLine = line.clone();
        curLine.attr('style', 'stroke:rgb(111,111,111);stroke-width:0.5');
        curLine.attr('x1', '' + a);
        curLine.attr('y1', '0');
        curLine.attr('x2', '' + a);
        curLine.attr('y2', '' + scope.svgHeight);
        viewGroup.append(curLine);*/
    }

    for (let a = 0; a < scope.svgHeight; a += step)
        self.grid.horizontal.push({
            x: 0,
            y: a,
            x2: scope.svgWidth,
            y2: a,
        });
}

function getOffsetPos(element, event) {
    var elementRect = element[0].getBoundingClientRect();
    return {x: event.clientX - elementRect.left, y: event.clientY - elementRect.top};
}

function convertCoordinateFromClienToSvg($element, parentNode, clientCoord) {
	var parentScrollPos = {
		x: parentNode.scrollLeft ? parentNode.scrollLeft: 0,
		y: parentNode.scrollTop ? parentNode.scrollTop: 0
	};

	var svgRect = $element[0].getBoundingClientRect();

	return {
		x: clientCoord.x - svgRect.left +  parentScrollPos.x,
		y: clientCoord.y - svgRect.top + parentScrollPos.y
	};
}

function isPointInRect(point, rect) {
    return (point.x >= rect.x() &&
			point.x <= rect.right() &&
			point.y >= rect.y() &&
			point.y <= rect.bottom());
}

function selectItems (array, options) {
    if (typeof options == 'undefined') {
        for(let i = 0; i < array.length; ++i) {
            array[i].isActive = true;
        }
    } else {
        for(let i = 0; i < array.length; ++i) {
            array[i].isActive = options;
        }
    }
}