from flask import Flask
from flask_login import LoginManager
from pathlib import Path
from dotenv import dotenv_values

config = dotenv_values('.env')
app = Flask(__name__)
dbpath = Path(__file__).parent.parent / 'db.sqlite3'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{dbpath.as_posix()}'

app.config['SECRET_KEY'] = config['SECRET_KEY']


from frydea.database import db
db.init_app(app)

# 导入定义的模型
import frydea.models
with app.app_context():
    db.create_all()

login_manager = LoginManager(app)
login_manager.init_app(app)

# 注册http路由函数
import frydea.views