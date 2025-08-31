
# Check if .env file exists and include it
ifeq (,$(wildcard ./.env))
    # Optional: Handle the case where .env doesn't exist, e.g., create from an example
    # cp .env.example .env
else
    include .env
    export $(shell sed 's/=.*//' .env)
endif

setup:
	npm i -g web-ext

build:
	web-ext build --overwrite-dest

sign:
	web-ext sign --api-key=$$KEY --api-secret=$$SECRET --channel=listed --amo-metadata metadata.json


# Caminhos
FF_BUILD := web-ext-artifacts/*.xpi
CHROME_BUILD_DIR := dist/chrome
CHROME_ZIP := $(CHROME_BUILD_DIR)/overseerr-assistant-reborn.zip

# Alvo: build Chrome a partir do Firefox
build-chrome: $(CHROME_ZIP)
	@echo "Chrome extension ready: $(CHROME_ZIP)"

# Empacota a pasta do Firefox para Chrome
$(CHROME_ZIP): $(FF_BUILD)
	@echo "Preparing Chrome build..."
	# limpa build anterior
	@rm -rf $(CHROME_BUILD_DIR)
	@mkdir -p $(CHROME_BUILD_DIR)
	# descompacta XPI (XPI = ZIP)
	@unzip -q -d $(CHROME_BUILD_DIR) $(FF_BUILD)
	# opcional: aplicar patch para manifest Chrome (V3)
	@sed -i 's/"manifest_version": 2/"manifest_version": 3/' $(CHROME_BUILD_DIR)/manifest.json
	# empacota em ZIP
	@cd $(CHROME_BUILD_DIR) && zip -r overseerr-assistant-reborn.zip . >/dev/null
