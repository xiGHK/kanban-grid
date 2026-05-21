'use strict';

var obsidian = require('obsidian');

var VIEW_TYPE = 'kanban-grid-view';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getCards(data, row, col) {
  if (!data.cards[row]) return [];
  if (!data.cards[row][col]) return [];
  return data.cards[row][col];
}

function setCards(data, row, col, cards) {
  if (!data.cards[row]) data.cards[row] = {};
  data.cards[row][col] = cards;
}

// ── Modals ──

class InputModal extends obsidian.Modal {
  constructor(app, title, placeholder, onSubmit) {
    super(app);
    this.titleText = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    var contentEl = this.contentEl;
    contentEl.createEl('h3', { text: this.titleText });

    var input = contentEl.createEl('input', {
      type: 'text',
      placeholder: this.placeholder,
    });
    input.style.width = '100%';
    input.style.marginBottom = '12px';
    input.style.padding = '6px 8px';

    var self = this;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && input.value.trim()) {
        self.onSubmit(input.value.trim());
        self.close();
      }
    });

    var btn = contentEl.createEl('button', { text: 'Add' });
    btn.addClass('mod-cta');
    btn.addEventListener('click', function () {
      if (input.value.trim()) {
        self.onSubmit(input.value.trim());
        self.close();
      }
    });

    setTimeout(function () { input.focus(); }, 10);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CardModal extends obsidian.Modal {
  constructor(app, title, card, onSubmit) {
    super(app);
    this.titleText = title;
    this.card = card || { title: '', description: '' };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    var contentEl = this.contentEl;
    var card = this.card;
    var self = this;

    contentEl.createEl('h3', { text: this.titleText });

    new obsidian.Setting(contentEl)
      .setName('Title')
      .addText(function (text) {
        text.setValue(card.title).onChange(function (v) {
          card.title = v;
        });
        text.inputEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            if (card.title.trim()) {
              self.onSubmit(card);
              self.close();
            }
          }
        });
      });

    new obsidian.Setting(contentEl)
      .setName('Description')
      .addTextArea(function (text) {
        text.setValue(card.description || '').onChange(function (v) {
          card.description = v;
        });
        text.inputEl.rows = 4;
      });

    new obsidian.Setting(contentEl).addButton(function (btn) {
      btn
        .setButtonText('Save')
        .setCta()
        .onClick(function () {
          if (card.title.trim()) {
            self.onSubmit(card);
            self.close();
          }
        });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmModal extends obsidian.Modal {
  constructor(app, message, onConfirm) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    var contentEl = this.contentEl;
    var self = this;
    contentEl.createEl('p', { text: this.message });

    var row = contentEl.createDiv();
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.justifyContent = 'flex-end';
    row.style.marginTop = '12px';

    var cancelBtn = row.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', function () {
      self.close();
    });

    var confirmBtn = row.createEl('button', { text: 'Delete' });
    confirmBtn.addClass('mod-warning');
    confirmBtn.addEventListener('click', function () {
      self.onConfirm();
      self.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class RenameModal extends obsidian.Modal {
  constructor(app, title, currentName, onSubmit) {
    super(app);
    this.titleText = title;
    this.currentName = currentName;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    var contentEl = this.contentEl;
    var self = this;
    contentEl.createEl('h3', { text: this.titleText });

    var input = contentEl.createEl('input', { type: 'text' });
    input.value = this.currentName;
    input.style.width = '100%';
    input.style.marginBottom = '12px';
    input.style.padding = '6px 8px';

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && input.value.trim()) {
        self.onSubmit(input.value.trim());
        self.close();
      }
    });

    var btn = contentEl.createEl('button', { text: 'Rename' });
    btn.addClass('mod-cta');
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
    this.render();
  }

  async onClose() {}

  render() {
    var content = this.containerEl.children[1];
    content.empty();
    content.addClass('kanban-grid-container');

    var data = this.plugin.data;
    var self = this;

    // ── Toolbar ──
    var toolbar = content.createDiv('kanban-grid-toolbar');

    var addColBtn = toolbar.createEl('button', { text: '+ Column' });
    addColBtn.addEventListener('click', function () {
      new InputModal(
        self.app,
        'New Column',
        'e.g. Backlog, Review, Watching...',
        async function (name) {
          if (!data.columns.includes(name)) {
            data.columns.push(name);
            await self.plugin.saveData(data);
            self.render();
          } else {
            new obsidian.Notice('Column "' + name + '" already exists.');
          }
        }
      ).open();
    });

    var addRowBtn = toolbar.createEl('button', { text: '+ Row' });
    addRowBtn.addEventListener('click', function () {
      new InputModal(
        self.app,
        'New Row',
        'e.g. Project Alpha, Personal...',
        async function (name) {
          if (!data.rows.includes(name)) {
            data.rows.push(name);
            await self.plugin.saveData(data);
            self.render();
          } else {
            new obsidian.Notice('Row "' + name + '" already exists.');
          }
        }
      ).open();
    });

    // ── Grid ──
    var grid = content.createDiv('kanban-grid');
    grid.style.gridTemplateColumns =
      '160px repeat(' + data.columns.length + ', minmax(180px, 1fr))';

    // Header row: corner + column headers
    grid.createDiv('kanban-grid-header kanban-grid-corner');

    data.columns.forEach(function (col) {
      var header = grid.createDiv('kanban-grid-header');
      var label = header.createSpan({ text: col });

      // Double-click to rename
      label.addEventListener('dblclick', function () {
        new RenameModal(
          self.app,
          'Rename Column',
          col,
          async function (newName) {
            if (newName === col) return;
            if (data.columns.includes(newName)) {
              new obsidian.Notice('Column "' + newName + '" already exists.');
              return;
            }
            var idx = data.columns.indexOf(col);
            data.columns[idx] = newName;
            for (var r = 0; r < data.rows.length; r++) {
              var row = data.rows[r];
              if (data.cards[row] && data.cards[row][col]) {
                data.cards[row][newName] = data.cards[row][col];
                delete data.cards[row][col];
              }
            }
            await self.plugin.saveData(data);
            self.render();
          }
        ).open();
      });

      var delBtn = header.createEl('button', {
        text: '×',
        cls: 'kanban-grid-delete-btn',
      });
      delBtn.setAttribute('aria-label', 'Delete column');
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        new ConfirmModal(
          self.app,
          'Delete column "' + col + '"? Cards in this column will be removed.',
          async function () {
            data.columns = data.columns.filter(function (c) {
              return c !== col;
            });
            for (var r = 0; r < data.rows.length; r++) {
              if (data.cards[data.rows[r]]) delete data.cards[data.rows[r]][col];
            }
            await self.plugin.saveData(data);
            self.render();
          }
        ).open();
      });
    });

    // Data rows
    data.rows.forEach(function (row) {
      // Row label
      var rowLabel = grid.createDiv('kanban-grid-row-label');
      var rowText = rowLabel.createSpan({ text: row });

      // Double-click to rename
      rowText.addEventListener('dblclick', function () {
        new RenameModal(
          self.app,
          'Rename Row',
          row,
          async function (newName) {
            if (newName === row) return;
            if (data.rows.includes(newName)) {
              new obsidian.Notice('Row "' + newName + '" already exists.');
              return;
            }
            var idx = data.rows.indexOf(row);
            data.rows[idx] = newName;
            if (data.cards[row]) {
              data.cards[newName] = data.cards[row];
              delete data.cards[row];
            }
            await self.plugin.saveData(data);
            self.render();
          }
        ).open();
      });

      var delRowBtn = rowLabel.createEl('button', {
        text: '×',
        cls: 'kanban-grid-delete-btn',
      });
      delRowBtn.setAttribute('aria-label', 'Delete row');
      delRowBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        new ConfirmModal(
          self.app,
          'Delete row "' + row + '"? All cards in this row will be removed.',
          async function () {
            data.rows = data.rows.filter(function (r) {
              return r !== row;
            });
            delete data.cards[row];
            await self.plugin.saveData(data);
            self.render();
          }
        ).open();
      });

      // Cells for each column
      data.columns.forEach(function (col) {
        var cell = grid.createDiv('kanban-grid-cell');
        cell.dataset.row = row;
        cell.dataset.col = col;

        // Drop target
        cell.addEventListener('dragover', function (e) {
          e.preventDefault();
          cell.addClass('kanban-grid-cell-dragover');
        });
        cell.addEventListener('dragleave', function () {
          cell.removeClass('kanban-grid-cell-dragover');
        });
        cell.addEventListener('drop', async function (e) {
          e.preventDefault();
          cell.removeClass('kanban-grid-cell-dragover');
          if (!self.dragData) return;

          var fromRow = self.dragData.fromRow;
          var fromCol = self.dragData.fromCol;
          var cardId = self.dragData.cardId;
          var toRow = row;
          var toCol = col;

          if (fromRow === toRow && fromCol === toCol) return;

          var sourceCards = getCards(data, fromRow, fromCol);
          var cardIndex = sourceCards.findIndex(function (c) {
            return c.id === cardId;
          });
          if (cardIndex === -1) return;

          var card = sourceCards.splice(cardIndex, 1)[0];
          setCards(data, fromRow, fromCol, sourceCards);

          var targetCards = getCards(data, toRow, toCol);
          targetCards.push(card);
          setCards(data, toRow, toCol, targetCards);

          await self.plugin.saveData(data);
          self.dragData = null;
          self.render();
        });

        // Render cards
        var cards = getCards(data, row, col);
        cards.forEach(function (card) {
          var cardEl = cell.createDiv('kanban-grid-card');
          cardEl.draggable = true;
          cardEl.createDiv({
            text: card.title,
            cls: 'kanban-grid-card-title',
          });
          if (card.description) {
            cardEl.createDiv({
              text: card.description,
              cls: 'kanban-grid-card-desc',
            });
          }

          cardEl.addEventListener('dragstart', function () {
            self.dragData = { fromRow: row, fromCol: col, cardId: card.id };
            cardEl.addClass('kanban-grid-card-dragging');
          });
          cardEl.addEventListener('dragend', function () {
            cardEl.removeClass('kanban-grid-card-dragging');
          });

          // Click to edit
          cardEl.addEventListener('click', function (e) {
            if (e.target.closest('.kanban-grid-card-delete')) return;
            new CardModal(
              self.app,
              'Edit Card',
              { title: card.title, description: card.description || '' },
              async function (updated) {
                card.title = updated.title;
                card.description = updated.description;
                await self.plugin.saveData(data);
                self.render();
              }
            ).open();
          });

          var delBtn = cardEl.createEl('button', {
            text: '×',
            cls: 'kanban-grid-card-delete',
          });
          delBtn.setAttribute('aria-label', 'Delete card');
          delBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            var idx = cards.findIndex(function (c) {
              return c.id === card.id;
            });
            if (idx > -1) cards.splice(idx, 1);
            setCards(data, row, col, cards);
            await self.plugin.saveData(data);
            self.render();
          });
        });

        // Add card button
        var addBtn = cell.createEl('button', {
          text: '+',
          cls: 'kanban-grid-add-card',
        });
        addBtn.addEventListener('click', function () {
          new CardModal(
            self.app,
            'New Card',
            null,
            async function (newCard) {
              newCard.id = generateId();
              var cards = getCards(data, row, col);
              cards.push(newCard);
              setCards(data, row, col, cards);
              await self.plugin.saveData(data);
              self.render();
            }
          ).open();
        });
      });
    });
  }
}

// ── Plugin ──

class KanbanGridPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadPluginData();

    this.registerView(VIEW_TYPE, function (leaf) {
      return new KanbanGridView(leaf, this);
    }.bind(this));

    this.addRibbonIcon('layout-grid', 'Open Kanban Grid', function () {
      this.activateView();
    }.bind(this));

    this.addCommand({
      id: 'open-kanban-grid',
      name: 'Open Kanban Grid',
      callback: function () {
        this.activateView();
      }.bind(this),
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
    this.data = Object.assign(
      {
        columns: ['To Do', 'In Progress', 'Done'],
        rows: ['Project 1'],
        cards: {},
      },
      saved || {}
    );
  }

  async onunload() {}
}

module.exports = KanbanGridPlugin;
