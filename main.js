'use strict';

var obsidian = require('obsidian');

var VIEW_TYPE = 'kanban-grid-view';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
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

    var placeholder = this.titleText === 'New Column'
      ? 'e.g. Backlog, Review, Watching...'
      : this.titleText === 'New Row'
        ? 'e.g. Project Alpha, Personal...'
        : 'Enter a name...';
    var input = contentEl.createEl('input', { type: 'text', placeholder: placeholder });
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

class KanbanGridView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.dragData = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return 'Kanban Grid';
  }
  getIcon() {
    return 'layout-grid';
  }

  async onOpen() {
    var self = this;

    this.addAction('plus-circle', 'Add row', function () {
      var data = self.plugin.data;
      new PromptModal(self.app, 'New Row', '', async function (name) {
        data.rows.push({
          id: generateId(),
          name: name,
          columns: ['To Do', 'In Progress', 'Done'],
          cards: {},
        });
        await self.plugin.saveData(data);
        self.render();
      }).open();
    });

    this.render();
  }

  async onClose() {}

  render() {
    var content = this.containerEl.children[1];
    content.empty();
    content.addClass('kg');

    var data = this.plugin.data;
    var self = this;

    // ── Board ──
    var board = content.createDiv('kg-board');

    data.rows.forEach(function (rowData) {
      var rowEl = board.createDiv('kg-row');

      // ── Row Header ──
      var rowHeader = rowEl.createDiv('kg-row-header');
      var rowTitleSpan = rowHeader.createSpan({ text: rowData.name, cls: 'kg-row-title' });

      rowTitleSpan.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'text';
        input.value = rowData.name;
        input.className = 'kg-row-title-input';

        rowTitleSpan.replaceWith(input);
        input.focus();
        input.select();

        var saved = false;
        var doSave = async function () {
          if (saved) return;
          saved = true;
          var newName = input.value.trim();
          if (newName && newName !== rowData.name) {
            rowData.name = newName;
            await self.plugin.saveData(data);
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
                async function (name) {
                  if (!rowData.columns.includes(name)) {
                    rowData.columns.push(name);
                    await self.plugin.saveData(data);
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
            .onClick(async function () {
              data.rows = data.rows.filter(function (r) {
                return r.id !== rowData.id;
              });
              await self.plugin.saveData(data);
              self.render();
            });
        });
        menu.showAtMouseEvent(e);
      });

      // ── Lanes ──
      var lanesEl = rowEl.createDiv('kg-lanes');

      rowData.columns.forEach(function (col) {
        var cards = rowData.cards[col] || [];

        var laneWrapper = lanesEl.createDiv('kg-lane-wrapper');
        var lane = laneWrapper.createDiv('kg-lane');

        // ── Lane Header ──
        var laneHeader = lane.createDiv('kg-lane-header');
        laneHeader.createDiv({ text: col, cls: 'kg-lane-title' });
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
                  async function (newName) {
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
                    await self.plugin.saveData(data);
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
              .onClick(async function () {
                rowData.columns = rowData.columns.filter(function (c) {
                  return c !== col;
                });
                delete rowData.cards[col];
                await self.plugin.saveData(data);
                self.render();
              });
          });
          menu.showAtMouseEvent(e);
        });

        // ── Lane Items (drop zone) ──
        var laneItems = lane.createDiv('kg-lane-items');

        lane.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          lane.addClass('is-drop-target');
        });
        lane.addEventListener('dragleave', function (e) {
          if (!e.relatedTarget || !lane.contains(e.relatedTarget)) {
            lane.removeClass('is-drop-target');
          }
        });
        lane.addEventListener('drop', async function (e) {
          e.preventDefault();
          lane.removeClass('is-drop-target');
          if (!self.dragData) return;

          var srcRowId = self.dragData.fromRowId;
          var srcCol = self.dragData.fromCol;
          var cardId = self.dragData.cardId;

          if (srcRowId === rowData.id && srcCol === col) {
            self.dragData = null;
            return;
          }

          var srcRow = data.rows.find(function (r) {
            return r.id === srcRowId;
          });
          if (!srcRow) return;

          var srcCards = srcRow.cards[srcCol] || [];
          var cardIndex = srcCards.findIndex(function (c) {
            return c.id === cardId;
          });
          if (cardIndex === -1) return;

          var movedCard = srcCards.splice(cardIndex, 1)[0];
          srcRow.cards[srcCol] = srcCards;

          if (!rowData.cards[col]) rowData.cards[col] = [];
          rowData.cards[col].push(movedCard);

          self.dragData = null;
          await self.plugin.saveData(data);
          self.render();
        });

        // Render cards
        cards.forEach(function (card) {
          var itemEl = laneItems.createDiv('kg-item');
          itemEl.draggable = true;

          var itemContent = itemEl.createDiv('kg-item-content');
          var itemTitleWrap = itemContent.createDiv('kg-item-title-wrapper');
          itemTitleWrap.createDiv({
            text: card.title,
            cls: 'kg-item-title',
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
                    async function (newTitle) {
                      card.title = newTitle;
                      await self.plugin.saveData(data);
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
                .onClick(async function () {
                  var idx = cards.findIndex(function (c) {
                    return c.id === card.id;
                  });
                  if (idx > -1) cards.splice(idx, 1);
                  rowData.cards[col] = cards;
                  await self.plugin.saveData(data);
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

          var doSave = async function () {
            var title = textarea.value.trim();
            if (title) {
              if (!rowData.cards[col]) rowData.cards[col] = [];
              rowData.cards[col].push({ id: generateId(), title: title });
              await self.plugin.saveData(data);
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
      });

    });
  }
}

// ── Plugin ──

class KanbanGridPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadPluginData();

    var self = this;
    this.registerView(VIEW_TYPE, function (leaf) {
      return new KanbanGridView(leaf, self);
    });

    this.addRibbonIcon('layout-grid', 'Open Kanban Grid', function () {
      self.activateView();
    });

    this.addCommand({
      id: 'open-kanban-grid',
      name: 'Open Kanban Grid',
      callback: function () {
        self.activateView();
      },
    });
  }

  async activateView() {
    var workspace = this.app.workspace;
    var leaves = workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      var leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async loadPluginData() {
    var saved = await this.loadData();

    if (!saved) {
      this.data = {
        rows: [
          {
            id: generateId(),
            name: 'Project 1',
            columns: ['To Do', 'In Progress', 'Done'],
            cards: {},
          },
        ],
      };
      return;
    }

    // Migrate old format (global columns) to new format (per-row columns)
    if (saved.columns && Array.isArray(saved.columns)) {
      var oldRows = saved.rows || ['Project 1'];
      var oldCards = saved.cards || {};
      this.data = {
        rows: oldRows.map(function (name) {
          return {
            id: generateId(),
            name: name,
            columns: saved.columns.slice(),
            cards: oldCards[name] || {},
          };
        }),
      };
      await this.saveData(this.data);
      return;
    }

    this.data = saved;
  }

  async onunload() {}
}

module.exports = KanbanGridPlugin;
