from flask import Flask
from pathlib import Path

app = Flask(__name__)

from frydea.database import db
dbpath = Path(__file__).parent.parent / 'db.sqlite3'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{dbpath.as_posix()}'
db.init_app(app)
# 导入定义的模型
import frydea.models
with app.app_context():
    db.create_all()

# 注册http路由函数
import frydea.views