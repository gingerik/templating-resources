System.register(['aurelia-dependency-injection', 'aurelia-binding', 'aurelia-templating', './repeat-strategy-locator', './repeat-utilities', './analyze-view-factory'], function (_export) {
  'use strict';

  var inject, ObserverLocator, BoundViewFactory, TargetInstruction, ViewSlot, ViewResources, customAttribute, bindable, templateController, RepeatStrategyLocator, getItemsSourceExpression, unwrapExpression, isOneTime, viewsRequireLifecycle, Repeat;

  var _createDecoratedClass = (function () { function defineProperties(target, descriptors, initializers) { for (var i = 0; i < descriptors.length; i++) { var descriptor = descriptors[i]; var decorators = descriptor.decorators; var key = descriptor.key; delete descriptor.key; delete descriptor.decorators; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor || descriptor.initializer) descriptor.writable = true; if (decorators) { for (var f = 0; f < decorators.length; f++) { var decorator = decorators[f]; if (typeof decorator === 'function') { descriptor = decorator(target, key, descriptor) || descriptor; } else { throw new TypeError('The decorator for method ' + descriptor.key + ' is of the invalid type ' + typeof decorator); } } if (descriptor.initializer !== undefined) { initializers[key] = descriptor; continue; } } Object.defineProperty(target, key, descriptor); } } return function (Constructor, protoProps, staticProps, protoInitializers, staticInitializers) { if (protoProps) defineProperties(Constructor.prototype, protoProps, protoInitializers); if (staticProps) defineProperties(Constructor, staticProps, staticInitializers); return Constructor; }; })();

  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

  function _defineDecoratedPropertyDescriptor(target, key, descriptors) { var _descriptor = descriptors[key]; if (!_descriptor) return; var descriptor = {}; for (var _key in _descriptor) descriptor[_key] = _descriptor[_key]; descriptor.value = descriptor.initializer ? descriptor.initializer.call(target) : undefined; Object.defineProperty(target, key, descriptor); }

  return {
    setters: [function (_aureliaDependencyInjection) {
      inject = _aureliaDependencyInjection.inject;
    }, function (_aureliaBinding) {
      ObserverLocator = _aureliaBinding.ObserverLocator;
    }, function (_aureliaTemplating) {
      BoundViewFactory = _aureliaTemplating.BoundViewFactory;
      TargetInstruction = _aureliaTemplating.TargetInstruction;
      ViewSlot = _aureliaTemplating.ViewSlot;
      ViewResources = _aureliaTemplating.ViewResources;
      customAttribute = _aureliaTemplating.customAttribute;
      bindable = _aureliaTemplating.bindable;
      templateController = _aureliaTemplating.templateController;
    }, function (_repeatStrategyLocator) {
      RepeatStrategyLocator = _repeatStrategyLocator.RepeatStrategyLocator;
    }, function (_repeatUtilities) {
      getItemsSourceExpression = _repeatUtilities.getItemsSourceExpression;
      unwrapExpression = _repeatUtilities.unwrapExpression;
      isOneTime = _repeatUtilities.isOneTime;
    }, function (_analyzeViewFactory) {
      viewsRequireLifecycle = _analyzeViewFactory.viewsRequireLifecycle;
    }],
    execute: function () {
      Repeat = (function () {
        var _instanceInitializers = {};

        _createDecoratedClass(Repeat, [{
          key: 'items',
          decorators: [bindable],
          initializer: null,
          enumerable: true
        }, {
          key: 'local',
          decorators: [bindable],
          initializer: null,
          enumerable: true
        }, {
          key: 'key',
          decorators: [bindable],
          initializer: null,
          enumerable: true
        }, {
          key: 'value',
          decorators: [bindable],
          initializer: null,
          enumerable: true
        }], null, _instanceInitializers);

        function Repeat(viewFactory, instruction, viewSlot, viewResources, observerLocator, strategyLocator) {
          _classCallCheck(this, _Repeat);

          _defineDecoratedPropertyDescriptor(this, 'items', _instanceInitializers);

          _defineDecoratedPropertyDescriptor(this, 'local', _instanceInitializers);

          _defineDecoratedPropertyDescriptor(this, 'key', _instanceInitializers);

          _defineDecoratedPropertyDescriptor(this, 'value', _instanceInitializers);

          this.viewFactory = viewFactory;
          this.instruction = instruction;
          this.viewSlot = viewSlot;
          this.lookupFunctions = viewResources.lookupFunctions;
          this.observerLocator = observerLocator;
          this.local = 'item';
          this.key = 'key';
          this.value = 'value';
          this.strategyLocator = strategyLocator;
          this.ignoreMutation = false;
          this.sourceExpression = getItemsSourceExpression(this.instruction, 'repeat.for');
          this.isOneTime = isOneTime(this.sourceExpression);
          this.viewsRequireLifecycle = viewsRequireLifecycle(viewFactory);
        }

        Repeat.prototype.call = function call(context, changes) {
          this[context](this.items, changes);
        };

        Repeat.prototype.bind = function bind(bindingContext, overrideContext) {
          this.scope = { bindingContext: bindingContext, overrideContext: overrideContext };
          this.itemsChanged();
        };

        Repeat.prototype.unbind = function unbind() {
          this.scope = null;
          this.items = null;
          this.viewSlot.removeAll(true);
          this._unsubscribeCollection();
        };

        Repeat.prototype._unsubscribeCollection = function _unsubscribeCollection() {
          if (this.collectionObserver) {
            this.collectionObserver.unsubscribe(this.callContext, this);
            this.collectionObserver = null;
            this.callContext = null;
          }
        };

        Repeat.prototype.itemsChanged = function itemsChanged() {
          this._unsubscribeCollection();

          if (!this.scope) {
            return;
          }

          var items = this.items;
          this.strategy = this.strategyLocator.getStrategy(items);

          if (!this.isOneTime && !this._observeInnerCollection()) {
            this._observeCollection();
          }
          this.strategy.instanceChanged(this, items);
        };

        Repeat.prototype._getInnerCollection = function _getInnerCollection() {
          var expression = unwrapExpression(this.sourceExpression);
          if (!expression) {
            return null;
          }
          return expression.evaluate(this.scope, null);
        };

        Repeat.prototype.handleCollectionMutated = function handleCollectionMutated(collection, changes) {
          this.strategy.instanceMutated(this, collection, changes);
        };

        Repeat.prototype.handleInnerCollectionMutated = function handleInnerCollectionMutated(collection, changes) {
          var _this = this;

          if (this.ignoreMutation) {
            return;
          }
          this.ignoreMutation = true;
          var newItems = this.sourceExpression.evaluate(this.scope, this.lookupFunctions);
          this.observerLocator.taskQueue.queueMicroTask(function () {
            return _this.ignoreMutation = false;
          });

          if (newItems === this.items) {
            this.itemsChanged();
          } else {
            this.items = newItems;
          }
        };

        Repeat.prototype._observeInnerCollection = function _observeInnerCollection() {
          var items = this._getInnerCollection();
          var strategy = this.strategyLocator.getStrategy(items);
          if (!strategy) {
            return false;
          }
          this.collectionObserver = strategy.getCollectionObserver(this.observerLocator, items);
          if (!this.collectionObserver) {
            return false;
          }
          this.callContext = 'handleInnerCollectionMutated';
          this.collectionObserver.subscribe(this.callContext, this);
          return true;
        };

        Repeat.prototype._observeCollection = function _observeCollection() {
          var items = this.items;
          this.collectionObserver = this.strategy.getCollectionObserver(this.observerLocator, items);
          if (this.collectionObserver) {
            this.callContext = 'handleCollectionMutated';
            this.collectionObserver.subscribe(this.callContext, this);
          }
        };

        var _Repeat = Repeat;
        Repeat = inject(BoundViewFactory, TargetInstruction, ViewSlot, ViewResources, ObserverLocator, RepeatStrategyLocator)(Repeat) || Repeat;
        Repeat = templateController(Repeat) || Repeat;
        Repeat = customAttribute('repeat')(Repeat) || Repeat;
        return Repeat;
      })();

      _export('Repeat', Repeat);
    }
  };
});