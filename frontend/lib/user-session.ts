import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  surname: string | null;
  role: 'user' | 'company' | 'admin';
  token: string;
  handle: string;
  avatar: string;
  accountType: 'user' | 'company';
  // Добавляем обратно favorites и liked
  favorites: string[];
  liked: string[];
  following: {
    id: string;
    name: string;
    handle: string;
    avatar: string;
    description: string;
  }[];
}

const USER_SESSION_KEY = 'user-session';

export async function setUserSession(session: UserSession): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
    console.log('✅ Сессия успешно сохранена');
  } catch (error) {
    console.error('❌ Ошибка сохранения сессии:', error);
    throw error;
  }
}

export async function getUserSession(): Promise<UserSession | null> {
  try {
    console.log('🔍 Получение сессии из AsyncStorage...');
    const sessionData = await AsyncStorage.getItem(USER_SESSION_KEY);

    if (!sessionData) {
      console.log('❌ Сессия не найдена в AsyncStorage');
      return null;
    }

    // Дополнительная проверка на невалидные данные
    if (typeof sessionData !== 'string') {
      console.log('❌ Данные сессии не являются строкой:', typeof sessionData);
      return null;
    }

    if (sessionData === '[object Promise]' || sessionData === '[object Object]') {
      console.log('❌ Невалидные данные сессии:', sessionData);
      return null;
    }

    try {
      const session = JSON.parse(sessionData);
      return session;
    } catch (parseError) {
      console.error('❌ Ошибка парсинга JSON:', parseError);
      return null;
    }
  } catch (error) {
    console.error('❌ Ошибка получения сессии:', error);
    return null;
  }
}

export async function clearUserSession(): Promise<void> {
  try {
    console.log('🗑️ Очистка сессии пользователя...');
    await AsyncStorage.removeItem(USER_SESSION_KEY);
    console.log('✅ Сессия пользователя очищена');
  } catch (error) {
    console.error('❌ Ошибка очистки сессии:', error);
    throw error;
  }
}

// Очистить только сессию пользователя (без лайков и избранного)
export async function clearUserSessionOnly(): Promise<void> {
  try {
    console.log('🗑️ Очистка только сессии пользователя...');
    await AsyncStorage.removeItem(USER_SESSION_KEY);
    console.log('✅ Сессия пользователя очищена (лайки и избранное сохранены)');
  } catch (error) {
    console.error('❌ Ошибка очистки сессии:', error);
    throw error;
  }
}

