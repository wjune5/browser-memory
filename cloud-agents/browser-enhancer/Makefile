install:
	@command -v uv >/dev/null 2>&1 || { echo "uv is not installed. Installing uv..."; curl -LsSf https://astral.sh/uv/0.6.12/install.sh | sh; source $HOME/.local/bin/env; }
	uv sync --dev --extra streamlit --extra jupyter --frozen

playground:
	@echo "==============================================================================="
	@echo "| 🚀 Starting your agent playground...                                        |"
	@echo "|                                                                             |"
	@echo "| 💡 Try asking: How can I implement a function to sort a list in Python?     |"
	@echo "==============================================================================="
	uv run uvicorn app.server:app --host 0.0.0.0 --port 8000 --reload &
	uv run streamlit run frontend/streamlit_app.py --browser.serverAddress=localhost --server.enableCORS=false --server.enableXsrfProtection=false

backend:
	PROJECT_ID=$$(gcloud config get-value project) && \
	gcloud run deploy quickseek-backend \
		--source . \
		--memory "4Gi" \
		--project $$PROJECT_ID \
		--region "us-central1" \
		--allow-unauthenticated \
		--labels "created-by=adk" \
		--set-env-vars \
		"COMMIT_SHA=$(shell git rev-parse HEAD),GEMINI_API_KEY=$$GEMINI_API_KEY"

local-backend:
	uv run uvicorn app.server:app --host 0.0.0.0 --port 8000 --reload

setup-dev-env:
	PROJECT_ID=$$(gcloud config get-value project) && \
	(cd deployment/terraform/dev && terraform init && terraform apply --var-file vars/env.tfvars --var dev_project_id=$$PROJECT_ID --auto-approve)

test:
	uv run pytest tests/unit && uv run pytest tests/integration

lint:
	uv run codespell
	uv run ruff check . --diff
	uv run ruff format . --check --diff
	uv run mypy .
