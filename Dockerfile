FROM python:3.11-slim

WORKDIR /app

# Copy and install backend dependencies first (better layer caching)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the rest of the project, preserving the backend/frontend sibling structure
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]