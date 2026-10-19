# Movie Tracker & Roulette (plus.plus)

[English version below](#english-version)

Веб-приложение для ведения личной библиотеки фильмов, аниме и сериалов с глубокой системой оценки и интерактивными механиками выбора. Проект ориентирован на визуальное удобство и азартный подход к выбору контента.

## Основной функционал

### 1. Продвинутая система рейтинга
* **Многофакторная оценка:** Каждый тайтл оценивается по 100-балльной шкале. Вместо ввода одной цифры используется набор слайдеров (Сюжет, Персонажи, Визуал и др.), которые формируют итоговый средневзвешенный балл.
* **Статус «Шедевр»:** При достижении оценки 100/100 баллов карточка фильма полностью трансформируется. Она получает золотое оформление, 3D-анимацию короны и уникальные визуальные эффекты свечения.
* **Категоризация:** Четкое разделение контента на Фильмы, Сериалы и Аниме для удобного управления списками.

### 2. Интерактивная рулетка (Slot Machine)
* **Механика игрового автомата:** Выбор того, что посмотреть, реализован в виде слот-машины. Используется кастомный алгоритм с визуализацией вращающейся ленты, эффектами Motion Blur и плавным торможением.
* **Настройка времени:** Пользователь может вручную выставить время вращения барабана (от 1 до 10 секунд) для создания нужного уровня интриги.
* **Режим «Выбывание»:** При активации этого режима выпавший фильм автоматически удаляется из списка планов после завершения крутки.

### 3. Техническая реализация
* **Синхронизация данных:** Использование Firebase для хранения данных в реальном времени. Списки и оценки доступны с любого устройства.
* **Интерфейс и UX:** Дизайн выполнен в стиле современного глассморфизма. Реализованы плавные каскадные анимации появления элементов при переходе между страницами и при загрузке интерфейса.
* **Адаптивность:** Полная поддержка мобильных браузеров с сохранением всех анимационных эффектов.

## Лицензия / License

**Все права защищены.** Использование, копирование, модификация или распространение данного кода и связанных с ним ресурсов без прямого письменного разрешения автора (Artem Shutovskiy) строго запрещены.

---

<a name="english-version"></a>
# Movie Tracker & Roulette (plus.plus)

A web application for maintaining a personal library of movies, anime, and series, featuring a deep rating system and interactive selection mechanics. The project focuses on visual aesthetics and a gamified approach to content selection.

## Key Features

### 1. Advanced Rating System
* **Multi-factor Evaluation:** Each title is rated on a 100-point scale. Instead of a single number, a set of sliders (Plot, Characters, Visuals, etc.) is used to calculate the final score.
* **"Masterpiece" Status:** When a title hits a 100/100 score, the card is completely transformed with a gold theme, 3D crown animations, and unique glow effects.
* **Categorization:** Clear separation between Movies, Series, and Anime for easier list management.

### 2. Interactive Roulette (Slot Machine)
* **Slot Mechanics:** Choosing what to watch is turned into a mini-game. It utilizes a custom slot-machine algorithm with motion blur effects and smooth easing.
* **Custom Duration:** Users can manually set the spin time (from 1 to 10 seconds) to control the level of suspense.
* **Elimination Mode:** When enabled, the winning title is automatically removed from the watchlist after the jackpot.

### 3. Technical Implementation
* **Data Synchronization:** Powered by Firebase for real-time storage. Your ratings and lists are synchronized across all devices.
* **UI/UX Design:** The interface is built on glassmorphism principles, featuring smooth cascading animations for element transitions and initial page loads.
* **Responsiveness:** Full support for mobile devices without compromising visual quality or animation smoothness.

## License
**All rights reserved.** The use, reproduction, modification, or distribution of this code and its associated assets without the express written permission of the author (Artem Shutovskiy) is strictly prohibited.
