"""Genera database.rules.json (reglas de seguridad de Realtime Database).
Uso: python3 tools/build_rules.py"""
import json, pathlib

ME = "root.child('uids/' + auth.uid).val()"
U = f"root.child('usuarios/' + {ME})"
ACT = f"auth != null && root.child('uids/' + auth.uid).isString() && {U}.child('activo').val() === true"
ADMIN = f"{ACT} && {U}.child('roles/admin').val() === true"
MESA = f"{ACT} && ({U}.child('roles/mesa').val() === true || {U}.child('roles/admin').val() === true)"
BOOT = "auth != null && !root.child('config/inicializado').exists()"
AUTH = "auth != null"

rules = {"rules": {
  "config": {".read": True, ".write": f"({ADMIN}) || ({BOOT})"},
  "login": {".read": True, "$k": {".write": f"({ADMIN}) || ({BOOT})"}},
  "usuarios": {".read": AUTH, "$k": {".write": f"({ADMIN}) || ({BOOT} && newData.child('uid').val() === auth.uid)"}},
  "uids": {".read": AUTH, "$uid": {".write": f"({ADMIN}) || ({BOOT} && $uid === auth.uid)"}},
  "presencia": {".read": AUTH, "$k": {".write": f"{AUTH} && root.child('uids/' + auth.uid).val() === $k"}},
  "torneos": {".read": True, ".write": ADMIN},
  "paneles": {".read": AUTH, ".write": ADMIN},
  "plataformas": {".read": True, ".write": MESA},
  "asignaciones": {".read": AUTH, ".write": MESA},
  "combates": {".read": True, ".indexOn": ["torneo"], ".write": MESA},
  "jueces": {".read": AUTH, "$code": {"$n": {".write":
    f"{ACT} && root.child('combates/' + $code + '/puestos/' + $n).val() === {ME}"
    " && root.child('combates/' + $code + '/phase').val().matches(/^(listo|combate|revision)$/)"}}},
}}
out = pathlib.Path(__file__).resolve().parent.parent / 'database.rules.json'
out.write_text(json.dumps(rules, indent=2, ensure_ascii=False) + '\n')
print('ok', out)
