.PHONY: ui cli test install clean

# Install dependencies
install:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -r backend/requirements.txt
	. .venv/bin/activate && playwright install chromium

# Run the Gradio UI (drag-and-drop)
ui:
	. .venv/bin/activate && cd backend && python app.py

# Run the CLI (pass PDF paths as args)
cli:
	. .venv/bin/activate && cd backend && python analyze.py $(ARGS)

# Run tests
test:
	. .venv/bin/activate && cd backend && python -m pytest tests/ -v

# Clean generated files
clean:
	rm -rf reports/ .pytest_cache __pycache__ backend/__pycache__ backend/graph/__pycache__ backend/tools/__pycache__ backend/tests/__pycache__

# Quick setup from scratch
setup: install
	@echo "Done! Copy backend/.env.example to backend/.env and add your API keys."
