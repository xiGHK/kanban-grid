'use strict';

var obsidian = require('obsidian');

var VIEW_TYPE = 'kanban-grid-view';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function defaultBoard() {
  return {
    rows: [
      {
        id: generateId(),
        name: 'Project 1',
        columns: ['To Do', 'In Progress', 'Done'],
        cards: {},
      },
    ],
  };
}

// ── Modals ──

class PromptModal extends obsidian.Modal {
  constructor(app, title, initialValue, onSubmit) {
    super(app);
    this.titleText = title;
    this.initialValue = initialValue || '';
    this.onSubmit = onSubmit;
  }

  onOpen() {
    var contentEl = this.contentEl;
    var self = this;
    contentEl.createEl('h3', { text: this.titleText });

    var placeholder =
      this.titleText === 'New Column'
        ? 'e.g. Backlog, Review, Watching...'
        : this.titleText === 'New Row'
          ? 'e.g. Project Alpha, Personal...'
          : 'Enter a name...';
    var input = contentEl.createEl('input', {
      type: 'text',
      placeholder: placeholder,
    });
    input.addClass('kg-modal-input');
    input.value = this.initialValue;

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && input.value.trim()) {
        self.onSubmit(input.value.trim());
        self.close();
      }
    });

    var btn = contentEl.createEl('button', { text: 'Save' });
    btn.addClass('mod-cta');
    btn.style.marginTop = '8px';
    btn.addEventListener('click', function () {
      if (input.value.trim()) {
        self.onSubmit(input.value.trim());
        self.close();
      }
    });

    setTimeout(function () {
      input.focus();
      input.select();
    }, 10);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class EditCardModal extends obsidian.Modal {
  constructor(app, cardTitle, onSubmit) {
    super(app);
    this.cardTitle = cardTitle;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    var contentEl = this.contentEl;
    var self = this;
    contentEl.createEl('h3', { text: 'Edit Card' });

    var textarea = contentEl.createEl('textarea');
    textarea.addClass('kg-modal-textarea');
    textarea.value = this.cardTitle;
    textarea.rows = 4;

    var btn = contentEl.createEl('button', { text: 'Save' });
    btn.addClass('mod-cta');
    btn.style.marginTop = '8px';
    btn.addEventListener('click', function () {
      if (textarea.value.trim()) {
        self.onSubmit(textarea.value.trim());
        self.close();
      }
    });

    setTimeout(function () {
      textarea.focus();
      textarea.setSelectionRange(
        textarea.value.length,
        textarea.value.length
      );
    }, 10);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── View ──

class KanbanGridView extends obsidian.TextFileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.boardData = null;
    this.dragData = null;
    this.dragColData = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file ? this.file.basename : 'Kanban Grid';
  }

  getIcon() {
    return 'layout-grid';
  }

  getViewData() {
    return this.boardData ? JSON.stringify(this.boardData, null, 2) : '';
  }

  setViewData(data, clear) {
    if (data && data.trim()) {
      try {
        this.boardData = JSON.parse(data);
      } catch (e) {
        this.boardData = defaultBoard();
      }
    } else {
      this.boardData = defaultBoard();
    }
    this.render();
  }

  clear() {
    this.boardData = null;
    this.contentEl.empty();
  }

  async onOpen() {
    await super.onOpen();
    var self = this;

    this.addAction('plus-circle', 'Add row', function () {
      if (!self.boardData) return;
      new PromptModal(self.app, 'New Row', '', function (name) {
        self.boardData.rows.push({
          id: generateId(),
          name: name,
          columns: ['To Do', 'In Progress', 'Done'],
          cards: {},
        });
        self.requestSave();
        self.render();
      }).open();
    });
  }

  render() {
    var content = this.contentEl;

    var prevBoard = content.querySelector('.kg-board');
    var prevScrollTop = prevBoard ? prevBoard.scrollTop : 0;
    var prevScrollLeft = prevBoard ? prevBoard.scrollLeft : 0;
    var laneItemScrolls = {};
    content.querySelectorAll('.kg-lane-items').forEach(function (el) {
      if (el.scrollTop && el.dataset.laneKey) {
        laneItemScrolls[el.dataset.laneKey] = el.scrollTop;
      }
    });

    content.empty();
    content.addClass('kg');

    if (!this.boardData) return;

    var data = this.boardData;
    var self = this;

    var board = content.createDiv('kg-board');

    // ── Drag-to-pan: grab empty space and move the board in any direction ──
    var panPointerId = null;
    var panStartX = 0, panStartY = 0, panStartLeft = 0, panStartTop = 0;
    var panning = false;

    board.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      // leave cards, drag handles, and controls to their own handlers
      if (e.target.closest('.kg-item, .kg-lane-header, button, a, input, textarea')) {
        return;
      }
      panPointerId = e.pointerId;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartLeft = board.scrollLeft;
      panStartTop = board.scrollTop;
      panning = false;
    });

    board.addEventListener('pointermove', function (e) {
      if (panPointerId === null || e.pointerId !== panPointerId) return;
      var dx = e.clientX - panStartX;
      var dy = e.clientY - panStartY;
      if (!panning) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        panning = true;
        board.addClass('is-panning');
        try { board.setPointerCapture(panPointerId); } catch (err) {}
      }
      e.preventDefault();
      board.scrollLeft = panStartLeft - dx;
      board.scrollTop = panStartTop - dy;
    });

    var endPan = function (e) {
      if (panPointerId === null) return;
      if (panning) {
        board.removeClass('is-panning');
        try { board.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      panPointerId = null;
      panning = false;
    };
    board.addEventListener('pointerup', endPan);
    board.addEventListener('pointercancel', endPan);

    // ── Edge auto-pan: scroll the board when a drag nears its edges ──
    var EDGE = 60;
    var MAX_SPEED = 16;
    var autoVX = 0, autoVY = 0, autoRAF = null;

    var autoStep = function () {
      if (!board.isConnected || (autoVX === 0 && autoVY === 0)) {
        autoRAF = null;
        return;
      }
      board.scrollLeft += autoVX;
      board.scrollTop += autoVY;
      autoRAF = requestAnimationFrame(autoStep);
    };

    var stopAutoPan = function () {
      autoVX = 0;
      autoVY = 0;
      if (autoRAF !== null) {
        cancelAnimationFrame(autoRAF);
        autoRAF = null;
      }
    };

    board.addEventListener('dragover', function (e) {
      if (!self.dragData && !self.dragColData && !self.dragRowId) return;
      var rect = board.getBoundingClientRect();
      var vx = 0, vy = 0;
      if (e.clientX < rect.left + EDGE) {
        vx = -MAX_SPEED * (Math.min(EDGE, rect.left + EDGE - e.clientX) / EDGE);
      } else if (e.clientX > rect.right - EDGE) {
        vx = MAX_SPEED * (Math.min(EDGE, e.clientX - (rect.right - EDGE)) / EDGE);
      }
      if (e.clientY < rect.top + EDGE) {
        vy = -MAX_SPEED * (Math.min(EDGE, rect.top + EDGE - e.clientY) / EDGE);
      } else if (e.clientY > rect.bottom - EDGE) {
        vy = MAX_SPEED * (Math.min(EDGE, e.clientY - (rect.bottom - EDGE)) / EDGE);
      }
      autoVX = vx;
      autoVY = vy;
      if ((vx !== 0 || vy !== 0) && autoRAF === null) {
        autoRAF = requestAnimationFrame(autoStep);
      }
    });

    board.addEventListener('drop', stopAutoPan);
    board.addEventListener('dragend', stopAutoPan);
    board.addEventListener('dragleave', function (e) {
      if (!e.relatedTarget || !board.contains(e.relatedTarget)) {
        stopAutoPan();
      }
    });

    // ── Board-level row drag handling ──
    var rowIndicator = document.createElement('div');
    rowIndicator.className = 'kg-row-drop-indicator';
    var lastRowIndicatorY = -1;

    board.addEventListener('dragover', function (e) {
      if (!self.dragRowId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      var y = Math.round(e.clientY / 8) * 8;
      if (y === lastRowIndicatorY) return;
      lastRowIndicatorY = y;

      if (rowIndicator.parentNode) rowIndicator.remove();

      var rowEls = Array.from(board.querySelectorAll('.kg-row'));
      var inserted = false;
      for (var i = 0; i < rowEls.length; i++) {
        var rect = rowEls[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          board.insertBefore(rowIndicator, rowEls[i]);
          inserted = true;
          break;
        }
      }
      if (!inserted) board.appendChild(rowIndicator);
    });

    board.addEventListener('dragleave', function (e) {
      if (!self.dragRowId) return;
      if (!e.relatedTarget || !board.contains(e.relatedTarget)) {
        if (rowIndicator.parentNode) rowIndicator.remove();
        lastRowIndicatorY = -1;
      }
    });

    board.addEventListener('drop', function (e) {
      if (!self.dragRowId) return;
      e.preventDefault();

      if (rowIndicator.parentNode) rowIndicator.remove();
      lastRowIndicatorY = -1;

      var fromIdx = data.rows.findIndex(function (r) {
        return r.id === self.dragRowId;
      });
      if (fromIdx === -1) return;

      var rowEls = Array.from(board.querySelectorAll('.kg-row'));
      var insertIdx = rowEls.length;
      for (var i = 0; i < rowEls.length; i++) {
        var rect = rowEls[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          insertIdx = i;
          break;
        }
      }
      if (insertIdx > fromIdx) insertIdx--;
      if (insertIdx === fromIdx) { self.dragRowId = null; return; }

      var moved = data.rows.splice(fromIdx, 1)[0];
      data.rows.splice(insertIdx, 0, moved);

      self.dragRowId = null;
      self.requestSave();
      self.render();
    });

    data.rows.forEach(function (rowData, rowIdx) {
      var rowEl = board.createDiv('kg-row');
      rowEl.dataset.rowId = rowData.id;

      // ── Row Header ──
      var rowHeader = rowEl.createDiv('kg-row-header');

      var rowGrip = rowHeader.createEl('a', {
        cls: 'kg-row-grip clickable-icon',
      });
      obsidian.setIcon(rowGrip, 'grip-vertical');
      rowGrip.draggable = true;

      rowGrip.addEventListener('dragstart', function (e) {
        self.dragRowId = rowData.id;
        rowEl.addClass('is-row-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
      });
      rowGrip.addEventListener('dragend', function () {
        rowEl.removeClass('is-row-dragging');
        self.dragRowId = null;
        if (rowIndicator.parentNode) rowIndicator.remove();
        lastRowIndicatorY = -1;
      });

      var rowTitleSpan = rowHeader.createSpan({
        text: rowData.name,
        cls: 'kg-row-title',
      });

      rowTitleSpan.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'text';
        input.value = rowData.name;
        input.className = 'kg-row-title-input';

        rowTitleSpan.replaceWith(input);
        input.focus();
        input.select();

        var saved = false;
        var doSave = function () {
          if (saved) return;
          saved = true;
          var newName = input.value.trim();
          if (newName && newName !== rowData.name) {
            rowData.name = newName;
            self.requestSave();
          }
          self.render();
        };
        var doCancel = function () {
          if (saved) return;
          saved = true;
          self.render();
        };

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') doSave();
          if (e.key === 'Escape') doCancel();
        });
        input.addEventListener('blur', doSave);
      });

      var rowMenuBtn = rowHeader.createEl('a', {
        cls: 'kg-row-menu clickable-icon',
      });
      obsidian.setIcon(rowMenuBtn, 'lucide-more-horizontal');
      rowMenuBtn.addEventListener('click', function (e) {
        var menu = new obsidian.Menu();
        menu.addItem(function (item) {
          item
            .setTitle('Add column')
            .setIcon('lucide-plus')
            .onClick(function () {
              new PromptModal(
                self.app,
                'New Column',
                '',
                function (name) {
                  if (!rowData.columns.includes(name)) {
                    rowData.columns.push(name);
                    self.requestSave();
                    self.render();
                  } else {
                    new obsidian.Notice(
                      'Column "' + name + '" already exists in this row.'
                    );
                  }
                }
              ).open();
            });
        });
        menu.addSeparator();
        menu.addItem(function (item) {
          item
            .setTitle('Delete row')
            .setIcon('lucide-trash-2')
            .onClick(function () {
              data.rows = data.rows.filter(function (r) {
                return r.id !== rowData.id;
              });
              self.requestSave();
              self.render();
            });
        });
        menu.showAtMouseEvent(e);
      });

      // ── Lanes ──
      var lanesEl = rowEl.createDiv('kg-lanes');

      // ── Column (lane) drag handling, scoped to this row ──
      var colIndicator = document.createElement('div');
      colIndicator.className = 'kg-col-drop-indicator';
      var lastColIndicatorX = -1;

      lanesEl.addEventListener('dragover', function (e) {
        if (!self.dragColData) return;
        if (self.dragColData.fromRowId !== rowData.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        var x = Math.round(e.clientX / 8) * 8;
        if (x === lastColIndicatorX) return;
        lastColIndicatorX = x;

        if (colIndicator.parentNode) colIndicator.remove();

        var laneEls = Array.from(lanesEl.querySelectorAll('.kg-lane-wrapper'));
        var inserted = false;
        for (var i = 0; i < laneEls.length; i++) {
          var rect = laneEls[i].getBoundingClientRect();
          if (e.clientX < rect.left + rect.width / 2) {
            lanesEl.insertBefore(colIndicator, laneEls[i]);
            inserted = true;
            break;
          }
        }
        if (!inserted) lanesEl.appendChild(colIndicator);
      });

      lanesEl.addEventListener('dragleave', function (e) {
        if (!self.dragColData) return;
        if (!e.relatedTarget || !lanesEl.contains(e.relatedTarget)) {
          if (colIndicator.parentNode) colIndicator.remove();
          lastColIndicatorX = -1;
        }
      });

      lanesEl.addEventListener('drop', function (e) {
        if (!self.dragColData) return;
        if (self.dragColData.fromRowId !== rowData.id) return;
        e.preventDefault();

        if (colIndicator.parentNode) colIndicator.remove();
        lastColIndicatorX = -1;

        var fromIdx = rowData.columns.indexOf(self.dragColData.col);
        if (fromIdx === -1) { self.dragColData = null; return; }

        var laneEls = Array.from(lanesEl.querySelectorAll('.kg-lane-wrapper'));
        var insertIdx = laneEls.length;
        for (var i = 0; i < laneEls.length; i++) {
          var rect = laneEls[i].getBoundingClientRect();
          if (e.clientX < rect.left + rect.width / 2) {
            insertIdx = i;
            break;
          }
        }
        if (insertIdx > fromIdx) insertIdx--;
        if (insertIdx === fromIdx) { self.dragColData = null; return; }

        var movedCol = rowData.columns.splice(fromIdx, 1)[0];
        rowData.columns.splice(insertIdx, 0, movedCol);

        self.dragColData = null;
        self.requestSave();
        self.render();
      });

      rowData.columns.forEach(function (col) {
        var cards = rowData.cards[col] || [];

        var laneWrapper = lanesEl.createDiv('kg-lane-wrapper');
        var lane = laneWrapper.createDiv('kg-lane');

        // ── Lane Header ──
        var laneHeader = lane.createDiv('kg-lane-header');
        laneHeader.draggable = true;

        laneHeader.addEventListener('dragstart', function (e) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', '');
          try {
            var rect = lane.getBoundingClientRect();
            e.dataTransfer.setDragImage(
              lane,
              e.clientX - rect.left,
              e.clientY - rect.top
            );
          } catch (err) {}
          self.dragColData = { fromRowId: rowData.id, col: col };
          setTimeout(function () {
            laneWrapper.addClass('is-col-dragging');
          }, 0);
        });
        laneHeader.addEventListener('dragend', function () {
          laneWrapper.removeClass('is-col-dragging');
          self.dragColData = null;
          if (colIndicator.parentNode) colIndicator.remove();
          lastColIndicatorX = -1;
        });

        var laneTitleDiv = laneHeader.createDiv({ text: col, cls: 'kg-lane-title' });

        laneTitleDiv.addEventListener('click', function () {
          laneHeader.draggable = false;
          var input = document.createElement('input');
          input.type = 'text';
          input.value = col;
          input.className = 'kg-lane-title-input';

          laneTitleDiv.replaceWith(input);
          input.focus();
          input.select();

          var saved = false;
          var doSave = function () {
            if (saved) return;
            saved = true;
            var newName = input.value.trim();
            if (newName && newName !== col && !rowData.columns.includes(newName)) {
              var idx = rowData.columns.indexOf(col);
              rowData.columns[idx] = newName;
              if (rowData.cards[col]) {
                rowData.cards[newName] = rowData.cards[col];
                delete rowData.cards[col];
              }
              self.requestSave();
            }
            self.render();
          };
          var doCancel = function () {
            if (saved) return;
            saved = true;
            self.render();
          };

          input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doSave();
            if (e.key === 'Escape') doCancel();
          });
          input.addEventListener('blur', doSave);
        });
        laneHeader.createDiv({
          text: String(cards.length),
          cls: 'kg-lane-count',
        });

        var laneMenuBtn = laneHeader.createEl('a', {
          cls: 'kg-lane-settings clickable-icon',
        });
        obsidian.setIcon(laneMenuBtn, 'lucide-more-vertical');
        laneMenuBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var menu = new obsidian.Menu();
          menu.addItem(function (item) {
            item
              .setTitle('Rename column')
              .setIcon('lucide-pencil')
              .onClick(function () {
                new PromptModal(
                  self.app,
                  'Rename Column',
                  col,
                  function (newName) {
                    if (newName === col) return;
                    if (rowData.columns.includes(newName)) {
                      new obsidian.Notice(
                        'Column "' + newName + '" already exists.'
                      );
                      return;
                    }
                    var idx = rowData.columns.indexOf(col);
                    rowData.columns[idx] = newName;
                    if (rowData.cards[col]) {
                      rowData.cards[newName] = rowData.cards[col];
                      delete rowData.cards[col];
                    }
                    self.requestSave();
                    self.render();
                  }
                ).open();
              });
          });
          menu.addSeparator();
          menu.addItem(function (item) {
            item
              .setTitle('Delete column')
              .setIcon('lucide-trash-2')
              .onClick(function () {
                rowData.columns = rowData.columns.filter(function (c) {
                  return c !== col;
                });
                delete rowData.cards[col];
                self.requestSave();
                self.render();
              });
          });
          menu.showAtMouseEvent(e);
        });

        // ── Lane Items (drop zone) ──
        var laneItems = lane.createDiv('kg-lane-items');
        var laneKey = rowData.id + '::' + col;
        laneItems.dataset.laneKey = laneKey;

        lane.addEventListener('dragover', function (e) {
          if (self.dragRowId || self.dragColData) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          lane.addClass('is-drop-target');

          var old = laneItems.querySelector('.kg-drop-indicator');
          if (old) old.remove();

          if (!self.dragData) return;

          var indicator = document.createElement('div');
          indicator.className = 'kg-drop-indicator';

          var cardEls = Array.from(
            laneItems.querySelectorAll('.kg-item')
          );
          var inserted = false;
          for (var i = 0; i < cardEls.length; i++) {
            var rect = cardEls[i].getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
              laneItems.insertBefore(indicator, cardEls[i]);
              inserted = true;
              break;
            }
          }
          if (!inserted) {
            laneItems.appendChild(indicator);
          }
        });
        lane.addEventListener('dragleave', function (e) {
          if (self.dragRowId || self.dragColData) return;
          if (!e.relatedTarget || !lane.contains(e.relatedTarget)) {
            lane.removeClass('is-drop-target');
            var ind = laneItems.querySelector('.kg-drop-indicator');
            if (ind) ind.remove();
          }
        });
        lane.addEventListener('drop', function (e) {
          if (self.dragRowId || self.dragColData) return;
          e.preventDefault();
          lane.removeClass('is-drop-target');
          var ind = laneItems.querySelector('.kg-drop-indicator');
          if (ind) ind.remove();
          if (!self.dragData) return;

          var srcRowId = self.dragData.fromRowId;
          var srcCol = self.dragData.fromCol;
          var cardId = self.dragData.cardId;

          var srcRow = data.rows.find(function (r) {
            return r.id === srcRowId;
          });
          if (!srcRow) return;

          var srcCards = srcRow.cards[srcCol] || [];
          var cardIndex = srcCards.findIndex(function (c) {
            return c.id === cardId;
          });
          if (cardIndex === -1) return;

          var cardEls = Array.from(
            laneItems.querySelectorAll('.kg-item')
          );
          var insertIndex = cardEls.length;
          for (var i = 0; i < cardEls.length; i++) {
            var rect = cardEls[i].getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
              insertIndex = i;
              break;
            }
          }

          var movedCard = srcCards.splice(cardIndex, 1)[0];

          if (srcRowId === rowData.id && srcCol === col) {
            if (insertIndex > cardIndex) insertIndex--;
            srcCards.splice(insertIndex, 0, movedCard);
            rowData.cards[col] = srcCards;
          } else {
            srcRow.cards[srcCol] = srcCards;
            if (!rowData.cards[col]) rowData.cards[col] = [];
            rowData.cards[col].splice(insertIndex, 0, movedCard);
          }

          self.dragData = null;
          self.requestSave();
          self.render();
        });

        // Render cards
        cards.forEach(function (card, cardIdx) {
          var itemEl = laneItems.createDiv('kg-item');
          itemEl.draggable = true;

          var itemContent = itemEl.createDiv('kg-item-content');
          var itemTitleWrap = itemContent.createDiv('kg-item-title-wrapper');
          itemTitleWrap.createSpan({
            text: String(cardIdx + 1),
            cls: 'kg-item-number',
          });
          var itemTitleDiv = itemTitleWrap.createDiv({
            text: card.title,
            cls: 'kg-item-title',
          });

          itemTitleDiv.addEventListener('click', function (e) {
            e.stopPropagation();
            var textarea = document.createElement('textarea');
            textarea.value = card.title;
            textarea.className = 'kg-item-title-input';
            textarea.rows = 1;
            textarea.style.height = itemTitleDiv.offsetHeight + 'px';

            itemTitleDiv.replaceWith(textarea);
            itemEl.draggable = false;
            textarea.focus();
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
            textarea.style.height = textarea.scrollHeight + 'px';

            var saved = false;
            var doSave = function () {
              if (saved) return;
              saved = true;
              var newTitle = textarea.value.trim();
              if (newTitle && newTitle !== card.title) {
                card.title = newTitle;
                self.requestSave();
              }
              self.render();
            };
            var doCancel = function () {
              if (saved) return;
              saved = true;
              self.render();
            };

            textarea.addEventListener('keydown', function (ev) {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                doSave();
              }
              if (ev.key === 'Escape') doCancel();
            });
            textarea.addEventListener('input', function () {
              textarea.style.height = 'auto';
              textarea.style.height = textarea.scrollHeight + 'px';
            });
            textarea.addEventListener('blur', doSave);
          });

          var itemMenuBtn = itemTitleWrap.createEl('a', {
            cls: 'kg-item-menu clickable-icon',
          });
          obsidian.setIcon(itemMenuBtn, 'lucide-more-vertical');

          itemEl.addEventListener('dragstart', function (e) {
            self.dragData = {
              fromRowId: rowData.id,
              fromCol: col,
              cardId: card.id,
            };
            itemEl.addClass('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
          });
          itemEl.addEventListener('dragend', function () {
            itemEl.removeClass('is-dragging');
            self.dragData = null;
          });

          itemMenuBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var menu = new obsidian.Menu();
            menu.addItem(function (item) {
              item
                .setTitle('Edit')
                .setIcon('lucide-pencil')
                .onClick(function () {
                  new EditCardModal(
                    self.app,
                    card.title,
                    function (newTitle) {
                      card.title = newTitle;
                      self.requestSave();
                      self.render();
                    }
                  ).open();
                });
            });
            menu.addSeparator();
            menu.addItem(function (item) {
              item
                .setTitle('Delete')
                .setIcon('lucide-trash-2')
                .onClick(function () {
                  var idx = cards.findIndex(function (c) {
                    return c.id === card.id;
                  });
                  if (idx > -1) cards.splice(idx, 1);
                  rowData.cards[col] = cards;
                  self.requestSave();
                  self.render();
                });
            });
            menu.showAtMouseEvent(e);
          });
        });

        if (cards.length === 0) {
          laneItems.createDiv('kg-placeholder');
        }

        // ── Lane Footer: +Add a card ──
        var laneFooter = lane.createDiv('kg-lane-footer');
        var addCardBtn = laneFooter.createEl('button', {
          cls: 'kg-add-card-btn',
        });
        addCardBtn.createSpan({ text: '+', cls: 'kg-add-card-plus' });
        addCardBtn.appendText('Add a card');

        addCardBtn.addEventListener('click', function () {
          addCardBtn.style.display = 'none';

          var form = laneFooter.createDiv('kg-add-form');
          var inputWrap = form.createDiv('kg-add-input-wrapper');
          var textarea = inputWrap.createEl('textarea', {
            attr: { placeholder: 'Enter a title for this card...' },
          });

          var btnRow = form.createDiv('kg-add-form-buttons');
          var saveBtn = btnRow.createEl('button', { text: 'Add card' });
          saveBtn.addClass('mod-cta');
          var cancelBtn = btnRow.createEl('button', { text: 'Cancel' });

          var doSave = function () {
            var title = textarea.value.trim();
            if (title) {
              if (!rowData.cards[col]) rowData.cards[col] = [];
              rowData.cards[col].push({ id: generateId(), title: title });
              self.pendingLaneScroll = laneKey;
              self.requestSave();
              self.render();
            } else {
              doCancel();
            }
          };

          var doCancel = function () {
            form.remove();
            addCardBtn.style.display = '';
          };

          saveBtn.addEventListener('click', doSave);
          cancelBtn.addEventListener('click', doCancel);
          textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              doSave();
            }
            if (e.key === 'Escape') doCancel();
          });

          setTimeout(function () {
            textarea.focus();
          }, 10);
        });

        if (self.pendingLaneScroll === laneKey) {
          self.pendingLaneScroll = null;
          laneItems.scrollTop = laneItems.scrollHeight;
        } else if (laneItemScrolls[laneKey]) {
          laneItems.scrollTop = laneItemScrolls[laneKey];
        }
      });

    });

    board.scrollTop = prevScrollTop;
    board.scrollLeft = prevScrollLeft;
  }
}

// ── Plugin ──

class KanbanGridPlugin extends obsidian.Plugin {
  async onload() {
    var self = this;

    this.registerView(VIEW_TYPE, function (leaf) {
      return new KanbanGridView(leaf, self);
    });

    this.registerExtensions(['grid'], VIEW_TYPE);

    this.addRibbonIcon('layout-grid', 'New Kanban Grid board', function () {
      self.createNewBoard();
    });

    this.addCommand({
      id: 'create-kanban-grid',
      name: 'Create new Kanban Grid board',
      callback: function () {
        self.createNewBoard();
      },
    });
  }

  async createNewBoard() {
    var data = defaultBoard();
    var baseName = 'Kanban Grid';
    var fileName = baseName + '.grid';
    var counter = 1;

    while (this.app.vault.getAbstractFileByPath(fileName)) {
      fileName = baseName + ' ' + counter + '.grid';
      counter++;
    }

    var file = await this.app.vault.create(
      fileName,
      JSON.stringify(data, null, 2)
    );
    var leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file);
  }

  async onunload() {}
}

module.exports = KanbanGridPlugin;
