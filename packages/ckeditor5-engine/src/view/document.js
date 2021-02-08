/**
 * @license Copyright (c) 2003-2021, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module engine/view/document
 */

import DocumentSelection from './documentselection';
import Collection from '@ckeditor/ckeditor5-utils/src/collection';
import mix from '@ckeditor/ckeditor5-utils/src/mix';
import ObservableMixin from '@ckeditor/ckeditor5-utils/src/observablemixin';
import BubblingObserver from './observer/bubblingobserver';

// @if CK_DEBUG_ENGINE // const { logDocument } = require( '../dev-utils/utils' );

/**
 * Document class creates an abstract layer over the content editable area, contains a tree of view elements and
 * {@link module:engine/view/documentselection~DocumentSelection view selection} associated with this document.
 *
 * @mixes module:utils/observablemixin~ObservableMixin
 */
export default class Document {
	/**
	 * Creates a Document instance.
	 *
	 * @param {module:engine/view/stylesmap~StylesProcessor} stylesProcessor The styles processor instance.
	 * @param {Map} observers TODO
	 */
	constructor( stylesProcessor, observers ) {
		/**
		 * Selection done on this document.
		 *
		 * @readonly
		 * @member {module:engine/view/documentselection~DocumentSelection} module:engine/view/document~Document#selection
		 */
		this.selection = new DocumentSelection();

		/**
		 * Roots of the view tree. Collection of the {@link module:engine/view/element~Element view elements}.
		 *
		 * View roots are created as a result of binding between {@link module:engine/view/document~Document#roots} and
		 * {@link module:engine/model/document~Document#roots} and this is handled by
		 * {@link module:engine/controller/editingcontroller~EditingController}, so to create view root we need to create
		 * model root using {@link module:engine/model/document~Document#createRoot}.
		 *
		 * @readonly
		 * @member {module:utils/collection~Collection} module:engine/view/document~Document#roots
		 */
		this.roots = new Collection( { idProperty: 'rootName' } );

		/**
		 * The styles processor instance used by this document when normalizing styles.
		 *
		 * @readonly
		 * @member {module:engine/view/stylesmap~StylesProcessor}
		 */
		this.stylesProcessor = stylesProcessor;

		/**
		 * Defines whether document is in read-only mode.
		 *
		 * When document is read-ony then all roots are read-only as well and caret placed inside this root is hidden.
		 *
		 * @observable
		 * @member {Boolean} #isReadOnly
		 */
		this.set( 'isReadOnly', false );

		/**
		 * True if document is focused.
		 *
		 * This property is updated by the {@link module:engine/view/observer/focusobserver~FocusObserver}.
		 * If the {@link module:engine/view/observer/focusobserver~FocusObserver} is disabled this property will not change.
		 *
		 * @readonly
		 * @observable
		 * @member {Boolean} module:engine/view/document~Document#isFocused
		 */
		this.set( 'isFocused', false );

		/**
		 * True if composition is in progress inside the document.
		 *
		 * This property is updated by the {@link module:engine/view/observer/compositionobserver~CompositionObserver}.
		 * If the {@link module:engine/view/observer/compositionobserver~CompositionObserver} is disabled this property will not change.
		 *
		 * @readonly
		 * @observable
		 * @member {Boolean} module:engine/view/document~Document#isComposing
		 */
		this.set( 'isComposing', false );

		/**
		 * Post-fixer callbacks registered to the view document.
		 *
		 * @private
		 * @member {Set}
		 */
		this._postFixers = new Set();

		/**
		 * TODO
		 *
		 * @private
		 * @member {Map}
		 */
		this._observers = observers;
	}

	/**
	 * Gets a {@link module:engine/view/document~Document#roots view root element} with the specified name. If the name is not
	 * specific "main" root is returned.
	 *
	 * @param {String} [name='main'] Name of the root.
	 * @returns {module:engine/view/rooteditableelement~RootEditableElement|null} The view root element with the specified name
	 * or null when there is no root of given name.
	 */
	getRoot( name = 'main' ) {
		return this.roots.get( name );
	}

	/**
	 * Allows registering post-fixer callbacks. A post-fixers mechanism allows to update the view tree just before it is rendered
	 * to the DOM.
	 *
	 * Post-fixers are executed right after all changes from the outermost change block were applied but
	 * before the {@link module:engine/view/view~View#event:render render event} is fired. If a post-fixer callback made
	 * a change, it should return `true`. When this happens, all post-fixers are fired again to check if something else should
	 * not be fixed in the new document tree state.
	 *
	 * View post-fixers are useful when you want to apply some fixes whenever the view structure changes. Keep in mind that
	 * changes executed in a view post-fixer should not break model-view mapping.
	 *
	 * The types of changes which should be safe:
	 *
	 * * adding or removing attribute from elements,
	 * * changes inside of {@link module:engine/view/uielement~UIElement UI elements},
	 * * {@link module:engine/model/differ~Differ#refreshItem marking some of the model elements to be re-converted}.
	 *
	 * Try to avoid changes which touch view structure:
	 *
	 * * you should not add or remove nor wrap or unwrap any view elements,
	 * * you should not change the editor data model in a view post-fixer.
	 *
	 * As a parameter, a post-fixer callback receives a {@link module:engine/view/downcastwriter~DowncastWriter downcast writer}.
	 *
	 * Typically, a post-fixer will look like this:
	 *
	 *		editor.editing.view.document.registerPostFixer( writer => {
	 *			if ( checkSomeCondition() ) {
	 *				writer.doSomething();
	 *
	 *				// Let other post-fixers know that something changed.
	 *				return true;
	 *			}
	 *		} );
	 *
	 * Note that nothing happens right after you register a post-fixer (e.g. execute such a code in the console).
	 * That is because adding a post-fixer does not execute it.
	 * The post-fixer will be executed as soon as any change in the document needs to cause its rendering.
	 * If you want to re-render the editor's view after registering the post-fixer then you should do it manually by calling
	 * {@link module:engine/view/view~View#forceRender `view.forceRender()`}.
	 *
	 * If you need to register a callback which is executed when DOM elements are already updated,
	 * use {@link module:engine/view/view~View#event:render render event}.
	 *
	 * @param {Function} postFixer
	 */
	registerPostFixer( postFixer ) {
		this._postFixers.add( postFixer );
	}

	/**
	 * Destroys this instance. Makes sure that all observers are destroyed and listeners removed.
	 */
	destroy() {
		this.roots.map( root => root.destroy() );
		this.stopListening();
	}

	/**
	 * Performs post-fixer loops. Executes post-fixer callbacks as long as none of them has done any changes to the model.
	 *
	 * @protected
	 * @param {module:engine/view/downcastwriter~DowncastWriter} writer
	 */
	_callPostFixers( writer ) {
		let wasFixed = false;

		do {
			for ( const callback of this._postFixers ) {
				wasFixed = callback( writer );

				if ( wasFixed ) {
					break;
				}
			}
		} while ( wasFixed );
	}

	/**
	 * TODO
	 *
	 * @protected
	 */
	_addEventListener( event, callback, options = {} ) {
		if ( options.context ) {
			for ( const observer of this._observers.values() ) {
				if ( observer instanceof BubblingObserver && observer.firedEventType == event ) {
					this.listenTo( observer, event, callback, options );
				}
			}
		} else {
			ObservableMixin._addEventListener.call( this, event, callback, options );
		}
	}

	/**
	 * TODO
	 *
	 * @protected
	 */
	_removeEventListener( event, callback ) {
		for ( const observer of this._observers.values() ) {
			if ( observer instanceof BubblingObserver && observer.firedEventType == event ) {
				this.stopListening( observer, event, callback );
			}
		}

		return ObservableMixin._removeEventListener.call( this, event, callback );
	}

	/**
	 * Event fired whenever document content layout changes. It is fired whenever content is
	 * {@link module:engine/view/view~View#event:render rendered}, but should be also fired by observers in case of
	 * other actions which may change layout, for instance when image loads.
	 *
	 * @event layoutChanged
	 */

	// @if CK_DEBUG_ENGINE // log( version ) {
	// @if CK_DEBUG_ENGINE //	logDocument( this, version );
	// @if CK_DEBUG_ENGINE // }
}

mix( Document, ObservableMixin );

/**
 * Enum representing type of the change.
 *
 * Possible values:
 *
 * * `children` - for child list changes,
 * * `attributes` - for element attributes changes,
 * * `text` - for text nodes changes.
 *
 * @typedef {String} module:engine/view/document~ChangeType
 */
