'use strict';
/**
 * 投稿表单校验（与前端 SubmitForm 的规则保持一致，后端为准）。
 * 返回 { ok, errors, value }；errors 为 { 字段: 中文提示 }。
 */

const CONTACT_TYPES = ['qq', 'wechat', 'email'];
const CREATION_TYPES = ['personal', 'team'];
const CATEGORIES = ['动画', '手书', '混剪', 'Cosplay', 'MMD', '音乐', '插画', '漫画', '故事', '原摄', '原壶', '原琴', '其他'];
const DURATIONS = ['小于 1 分钟', '1～3 分钟', '3～6 分钟', '6 分钟以上'];
const PROGRESS = ['仅有构想', '已开始制作', '已有初稿', '接近完成', '已完成'];
const PREVIEW_TYPES = ['link', 'file'];

function str(v) {
  return typeof v === 'string' ? v.trim() : (v === undefined || v === null ? '' : String(v).trim());
}

function pickEnum(value, allowed, field, label, errors, required) {
  const v = str(value);
  if (!v) {
    if (required) errors[field] = `请选择${label}`;
    return null;
  }
  if (!allowed.includes(v)) {
    errors[field] = `${label}取值不合法`;
    return null;
  }
  return v;
}

function validateSubmission(body) {
  const errors = {};
  const b = body && typeof body === 'object' ? body : {};

  /* 联系方式 */
  const contactType = pickEnum(b.contactType, CONTACT_TYPES, 'contactType', '联系方式类型', errors, true);
  const contactValue = str(b.contactValue);
  if (!contactValue) errors.contactValue = '请填写主要负责人联系方式';
  else if (contactValue.length > 200) errors.contactValue = '联系方式过长';

  const nicknames = str(b.nicknames).slice(0, 500);

  /* 投稿形式 */
  const creationType = pickEnum(b.creationType, CREATION_TYPES, 'creationType', '投稿形式', errors, true);

  /* 团队分工 */
  let members = [];
  if (creationType === 'team') {
    const raw = Array.isArray(b.teamMembers) ? b.teamMembers : [];
    members = raw.map((m) => ({ role: str(m && m.role), nickname: str(m && m.nickname) }));
    if (members.length < 2) {
      errors.teamMembers = '团队创作至少需要填写 2 位成员';
    } else if (members.some((m) => !m.role || !m.nickname)) {
      errors.teamMembers = '请把每位成员的分工和昵称都填完整';
    }
  }

  /* 单品信息 */
  const title = str(b.title);
  if (!title) errors.title = '请填写单品名称';
  else if (title.length > 200) errors.title = '单品名称过长';

  const category = pickEnum(b.category, CATEGORIES, 'category', '单品类别', errors, true);
  const intro = str(b.intro);
  if (!intro) errors.intro = '请填写作品大致简介';
  else if (intro.length > 5000) errors.intro = '简介过长（5000 字以内）';

  const duration = pickEnum(b.duration, DURATIONS, 'duration', '作品预计时间', errors, true);

  /* 其他角色 */
  const hasOther = b.hasOtherCharacters === true || b.hasOtherCharacters === 'true' || b.hasOtherCharacters === '是';
  let otherChars = [];
  if (hasOther) {
    const raw = Array.isArray(b.otherCharacters) ? b.otherCharacters : [];
    otherChars = raw.map((c) => str(c)).filter(Boolean);
    if (!otherChars.length) errors.otherCharacters = '请至少填写一个角色名';
    else if (otherChars.some((c) => c.length > 100)) errors.otherCharacters = '角色名过长';
  }

  /* 进展（选填） */
  const progress = pickEnum(b.progress, PROGRESS, 'progress', '作品进展', errors, false);

  /* 作品预览（选填；一旦选了方式，对应内容必填） */
  let previewType = pickEnum(b.previewType, PREVIEW_TYPES, 'previewType', '作品预览方式', errors, false);
  let previewLink = null;
  let fileIds = [];
  if (previewType === 'link') {
    previewLink = str(b.previewLink);
    if (!previewLink) errors.previewLink = '请填写作品链接';
    else if (previewLink.length > 1000) errors.previewLink = '链接过长';
    else if (!/^https?:\/\/\S+$/i.test(previewLink)) errors.previewLink = '链接需以 http:// 或 https:// 开头';
  } else if (previewType === 'file') {
    const raw = Array.isArray(b.fileIds) ? b.fileIds : [];
    fileIds = raw.map((f) => str(f)).filter((f) => /^[a-f0-9]{32}$/.test(f));
    if (!fileIds.length) errors.fileIds = '请先上传作品文件';
    if (fileIds.length > 5) errors.fileIds = '一次最多上传 5 个文件';
  } else {
    previewType = null;
  }

  /* 投稿须知 */
  if (b.agreed !== true) errors.agreed = '请先阅读并同意《投稿须知》';

  const value = {
    contactType, contactValue, nicknames: nicknames || null,
    creationType, teamMembers: members,
    title, category, intro, duration,
    hasOtherCharacters: hasOther,
    otherCharacters: hasOther ? otherChars : [],
    progress: progress || null,
    previewType,
    previewLink,
    fileIds,
    agreed: b.agreed === true,
  };

  return { ok: Object.keys(errors).length === 0, errors, value };
}

module.exports = {
  validateSubmission,
  CONTACT_TYPES, CREATION_TYPES, CATEGORIES, DURATIONS, PROGRESS, PREVIEW_TYPES,
};
