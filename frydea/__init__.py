from flask import Flask

app = Flask(__name__)

from frydea.database import db_session

@app.teardown_appcontext
def shutdown_dbsession(exception=None):
    db_session.remove()

# 注册http路由函数
import frydea.views