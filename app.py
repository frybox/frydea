from flask import Flask
from fryhcs import html, render
from frydea.components import App

app = Flask(__name__)

@app.get('/')
def index():
    return html(App, title='Frydea', autoreload=False)