FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./

# Ensure mount point exists even if storage/ is excluded from the build context.
RUN mkdir -p /app/storage

EXPOSE 8000

# Use shell form so ${PORT} can be expanded at runtime.
CMD gunicorn -w 2 -k gthread --threads 8 -b 0.0.0.0:${PORT:-8000} wsgi:app
