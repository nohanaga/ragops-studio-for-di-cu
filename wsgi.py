"""WSGI entrypoint for production servers (e.g., Gunicorn).

For Container Apps, this is expected to be launched with `gunicorn wsgi:app`.
"""

from app import create_app

app = create_app()
