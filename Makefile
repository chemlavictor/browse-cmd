# Makefile — browse-cmd
#
# Cible principale : build_prod
#   Compile l'extension dans dist/ (minifiée, sans commentaires),
#   prête pour la Chrome Web Store.

SHELL := /bin/bash
SRC   := src
DIST  := dist
NAME  := browse-cmd
JS_FILES := background/service-worker.js content/state.js content/commands.js content/ui.js content/content-script.js

.PHONY: all build_prod clean help

all: build_prod

## build_prod — compile l'extension pour la prod dans dist/
build_prod:
	@echo "→ Build production de $(NAME)"
	@mkdir -p $(DIST)/background $(DIST)/content $(DIST)/icons
	@cp $(SRC)/manifest.json $(DIST)/manifest.json
	@cp $(SRC)/icons/icon-16.png $(SRC)/icons/icon-48.png $(SRC)/icons/icon-128.png $(DIST)/icons/
	@for f in $(JS_FILES); do \
		echo "  minify: $$f"; \
		node -e "\
			const fs = require('fs'); \
			let s = fs.readFileSync('$(SRC)/$$f', 'utf8'); \
			s = s.replace(/\/\*[\s\S]*?\*\//g, ''); \
			s = s.replace(/\/\/[^\n]*/g, ''); \
			s = s.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n'); \
			fs.writeFileSync('$(DIST)/$$f', s); \
		"; \
	done
	@cd $(DIST) && sha256sum manifest.json background/service-worker.js content/state.js content/commands.js content/ui.js content/content-script.js icons/icon-16.png icons/icon-48.png icons/icon-128.png > CHECKSUMS.sha256
	@echo "→ Done. Contenu de $(DIST)/ :"
	@find $(DIST) -type f | sort | sed 's/^/   /'
	@echo "→ Prêt pour la Chrome Web Store : dossier $(DIST)/"

## clean — supprime le dossier de build
clean:
	rm -rf $(DIST)
	@echo "→ $(DIST)/ supprimé"

## help — affiche cette aide
help:
	@echo "Cibles :"
	@echo "  build_prod  Compile l'extension minifiée dans dist/"
	@echo "  clean       Supprime dist/"
	@echo "  help        Affiche cette aide"
