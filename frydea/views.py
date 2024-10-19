from fryhcs import html, render
from frydea import app
from frydea.components import App

@app.get('/')
def index():
    return html(App, title='Frydea', autoreload=False)