import $ from 'jquery';
import Component from '@ember/component';
import {action, computed, set} from '@ember/object';
import {utils as ghostHelperUtils} from '@tryghost/helpers';
import {isEmpty} from '@ember/utils';
import {run} from '@ember/runloop';
import {inject as service} from '@ember/service';

const {countWords} = ghostHelperUtils;

export const VIDEO_MIME_TYPES = 'video/mp4,application/mp4';
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'm4p'];

export default Component.extend({
    ui: service(),

    // attrs
    editor: null,
    files: null,
    payload: null,
    isSelected: false,
    isEditing: false,
    videoExtensions: VIDEO_EXTENSIONS,
    videoMimeTypes: VIDEO_MIME_TYPES,

    // properties
    handlesDragDrop: true,
    isEditingAlt: false,

    // closure actions
    selectCard() {},
    deselectCard() {},
    editCard() {},
    saveCard() {},
    deleteCard() {},
    moveCursorToNextSection() {},
    moveCursorToPrevSection() {},
    addParagraphAfterCard() {},
    registerComponent() {},

    counts: computed('payload.{src,caption}', function () {
        let wordCount = 0;
        let videoCount = 0;

        if (this.payload.src) {
            videoCount += 1;
        }

        if (this.payload.caption) {
            wordCount += countWords(this.payload.caption);
        }

        return {wordCount, videoCount};
    }),

    kgVideoStyle: computed('payload.cardWidth', function () {
        let cardWidth = this.payload.cardWidth;

        if (cardWidth === 'wide') {
            return 'image-wide';
        }

        if (cardWidth === 'full') {
            return 'image-full';
        }

        return 'image-normal';
    }),

    toolbar: computed('payload.{cardWidth,src}', function () {
        if (!this.payload.src) {
            return false;
        }

        let cardWidth = this.payload.cardWidth;

        return {
            items: [{
                title: 'Regular',
                icon: 'koenig/kg-img-regular',
                iconClass: `${!cardWidth ? 'fill-blue-l2' : 'fill-white'}`,
                action: run.bind(this, this._changeCardWidth, '')
            }, {
                title: 'Wide',
                icon: 'koenig/kg-img-wide',
                iconClass: `${cardWidth === 'wide' ? 'fill-blue-l2' : 'fill-white'}`,
                action: run.bind(this, this._changeCardWidth, 'wide')
            }, {
                title: 'Full',
                icon: 'koenig/kg-img-full',
                iconClass: `${cardWidth === 'full' ? 'fill-blue-l2' : 'fill-white'}`,
                action: run.bind(this, this._changeCardWidth, 'full')
            }, {
                divider: true
            }, {
                title: 'Replace video',
                icon: 'koenig/kg-replace',
                iconClass: 'fill-white',
                action: run.bind(this, this._triggerFileDialog)
            }]
        };
    }),

    init() {
        this._super(...arguments);

        if (!this.payload) {
            this.set('payload', {});
        }

        let placeholders = ['summer', 'mountains', 'ufo-attack'];
        this.set('placeholder', placeholders[Math.floor(Math.random() * placeholders.length)]);

        this.registerComponent(this);
    },

    didReceiveAttrs() {
        this._super(...arguments);

        // `payload.files` can be set if we have an externaly set video that
        // should be uploaded. Typical example would be from a paste or drag/drop
        if (!isEmpty(this.payload.files)) {
            run.schedule('afterRender', this, function () {
                this.set('files', this.payload.files);

                // we don't want to  persist any file data in the document
                delete this.payload.files;
            });
        }

        // switch back to displaying caption when card is not selected
        if (!this.isSelected) {
            this.set('isEditingAlt', false);
        }
    },

    didInsertElement() {
        if (this.payload.triggerBrowse && !this.payload.src && !this.payload.files) {
            // we don't want to persist this in the serialized payload
            this._updatePayloadAttr('triggerBrowse', undefined);

            let fileInput = this.element.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.click();
            }
        }
    },

    actions: {
        updateSrc(videos) {
            let [video] = videos;

            // create undo snapshot when video finishes uploading
            this.editor.run(() => {
                this._updatePayloadAttr('src', video.url);
                if (this._videoWidth && this._videoHeight) {
                    this._updatePayloadAttr('width', this._videoWidth);
                    this._updatePayloadAttr('height', this._videoHeight);
                }
                this._videoWidth = null;
                this._videoHeight = null;
            });
        },

        /**
         * Opens a file selection dialog - Triggered by "Upload Video" buttons,
         * searches for the hidden file input within the .gh-setting element
         * containing the clicked button then simulates a click
         * @param  {MouseEvent} event - MouseEvent fired by the button click
         */
        triggerFileDialog(event) {
            this._triggerFileDialog(event);
        },

        setPreviewSrc(files) {
            let file = files[0];
            if (file) {
                let url = URL.createObjectURL(file);
                this.set('previewSrc', url);

                let videoElem = document.createElement('video');
                videoElem.setAttribute('preload', 'metadata');
                videoElem.addEventListener('loadedmetadata', function () {
                    // store width/height for use later to avoid saving an video card with no `src`
                    this._videoWidth = videoElem.videoWidth;
                    this._videoHeight = videoElem.videoHeight;
                }, false);
                videoElem.src = url;
            }
        },

        resetSrcs() {
            this.set('previewSrc', null);
            this._videoWidth = null;
            this._videoHeight = null;

            // create undo snapshot when clearing
            this.editor.run(() => {
                this._updatePayloadAttr('src', null);
                this._updatePayloadAttr('width', null);
                this._updatePayloadAttr('height', null);
            });
        }
    },

    updateCaption: action(function (caption) {
        this._updatePayloadAttr('caption', caption);
    }),

    toggleAltEditing: action(function () {
        this.toggleProperty('isEditingAlt');
    }),

    updateAlt: action(function (alt) {
        this._updatePayloadAttr('alt', alt);
    }),

    dragOver(event) {
        if (!event.dataTransfer) {
            return;
        }

        // this is needed to work around inconsistencies with dropping files
        // from Chrome's downloads bar
        if (navigator.userAgent.indexOf('Chrome') > -1) {
            let eA = event.dataTransfer.effectAllowed;
            event.dataTransfer.dropEffect = (eA === 'move' || eA === 'linkMove') ? 'move' : 'copy';
        }

        event.stopPropagation();
        event.preventDefault();

        this.set('isDraggedOver', true);
    },

    dragLeave(event) {
        event.preventDefault();
        this.set('isDraggedOver', false);
    },

    drop(event) {
        event.preventDefault();
        this.set('isDraggedOver', false);

        if (event.dataTransfer.files) {
            this.set('files', [event.dataTransfer.files[0]]);
        }
    },

    _changeCardWidth(cardWidth) {
        // create undo snapshot when changing video size
        this.editor.run(() => {
            this._updatePayloadAttr('cardWidth', cardWidth);
        });
    },

    _updatePayloadAttr(attr, value) {
        let payload = this.payload;
        let save = this.saveCard;

        set(payload, attr, value);

        // update the mobiledoc and stay in edit mode
        save(payload, false);
    },

    _triggerFileDialog(event) {
        let target = event && event.target || this.element;

        // simulate click to open file dialog
        // using jQuery because IE11 doesn't support MouseEvent
        $(target)
            .closest('.__mobiledoc-card')
            .find('input[type="file"]')
            .click();
    }
});
